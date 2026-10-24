import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeEmail, isValidEmail, normalizePhdId, isValidPhdId } from '@/lib/utils/normalization';
import { recordAuditLog } from '@/lib/utils/audit';

export async function POST(request: Request) {
  try {
    const { category, filename, rows } = await request.json();

    if (!category || !rows || !Array.isArray(rows)) {
      return NextResponse.json(
        { error: 'Category and data rows are required.' },
        { status: 400 }
      );
    }

    if (category !== 'guide' && category !== 'phd_scholar') {
      return NextResponse.json(
        { error: 'Category must be either "guide" or "phd_scholar".' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // 1. Create import_batch record
    const { data: batch, error: batchErr } = await admin
      .from('import_batches')
      .insert({
        category,
        original_filename: filename || 'manual_upload',
        total_rows: rows.length,
        status: 'processing',
      })
      .select('id')
      .single();

    if (batchErr || !batch) {
      return NextResponse.json(
        { error: 'Failed to initialize import batch in database.' },
        { status: 500 }
      );
    }

    const batchId = batch.id;
    const validPeopleToInsert: any[] = [];
    const errorRecords: any[] = [];
    const seenInFile = new Set<string>();

    // 2. Fetch existing identifiers to detect conflicts
    let existingIdentifiers = new Set<string>();
    if (category === 'guide') {
      const { data: existingGuides } = await admin
        .from('people')
        .select('normalized_email')
        .eq('category', 'guide');
      if (existingGuides) {
        existingGuides.forEach((g) => {
          if (g.normalized_email) existingIdentifiers.add(g.normalized_email);
        });
      }
    } else {
      const { data: existingScholars } = await admin
        .from('people')
        .select('phd_id')
        .eq('category', 'phd_scholar');
      if (existingScholars) {
        existingScholars.forEach((s) => {
          if (s.phd_id) existingIdentifiers.add(s.phd_id);
        });
      }
    }

    // 3. Row-by-row validation
    rows.forEach((row: any, index: number) => {
      const rowNumber = index + 1;
      const rawName = row.name || row.Name || row['Full Name'] || '';
      const name = String(rawName).trim();

      if (!name) {
        errorRecords.push({
          import_batch_id: batchId,
          row_number: rowNumber,
          error_type: 'MISSING_NAME',
          message: 'The attendee name is missing or blank.',
          diagnostic_details: row,
        });
        return;
      }

      if (category === 'guide') {
        const rawEmail = row.email || row.Email || row['Email Address'] || '';
        const normalized = normalizeEmail(String(rawEmail));

        if (!normalized || !isValidEmail(normalized)) {
          errorRecords.push({
            import_batch_id: batchId,
            row_number: rowNumber,
            error_type: 'INVALID_EMAIL',
            message: `Invalid or missing email address: "${rawEmail}".`,
            diagnostic_details: row,
          });
          return;
        }

        if (seenInFile.has(normalized)) {
          errorRecords.push({
            import_batch_id: batchId,
            row_number: rowNumber,
            error_type: 'FILE_DUPLICATE_EMAIL',
            message: `Duplicate email within the uploaded file: "${normalized}".`,
            diagnostic_details: row,
          });
          return;
        }

        if (existingIdentifiers.has(normalized)) {
          errorRecords.push({
            import_batch_id: batchId,
            row_number: rowNumber,
            error_type: 'EXISTING_EMAIL',
            message: `Guide with email "${normalized}" is already registered in MRF database.`,
            diagnostic_details: row,
          });
          return;
        }

        seenInFile.add(normalized);
        validPeopleToInsert.push({
          category: 'guide',
          name,
          normalized_email: normalized,
          import_batch_id: batchId,
        });
      } else {
        // PhD Scholar
        const rawId = row.phd_id || row['PhD ID'] || row['Ph.D ID'] || row.id || row.ID || '';
        const normalized = normalizePhdId(String(rawId));

        if (!normalized || !isValidPhdId(normalized)) {
          errorRecords.push({
            import_batch_id: batchId,
            row_number: rowNumber,
            error_type: 'INVALID_PHD_ID',
            message: `Invalid or missing PhD ID: "${rawId}".`,
            diagnostic_details: row,
          });
          return;
        }

        if (seenInFile.has(normalized)) {
          errorRecords.push({
            import_batch_id: batchId,
            row_number: rowNumber,
            error_type: 'FILE_DUPLICATE_PHD_ID',
            message: `Duplicate PhD ID within the uploaded file: "${normalized}".`,
            diagnostic_details: row,
          });
          return;
        }

        if (existingIdentifiers.has(normalized)) {
          errorRecords.push({
            import_batch_id: batchId,
            row_number: rowNumber,
            error_type: 'EXISTING_PHD_ID',
            message: `PhD Scholar with ID "${normalized}" is already registered in MRF database.`,
            diagnostic_details: row,
          });
          return;
        }

        seenInFile.add(normalized);
        validPeopleToInsert.push({
          category: 'phd_scholar',
          name,
          phd_id: normalized,
          import_batch_id: batchId,
        });
      }
    });

    // 4. Insert valid records
    let successCount = 0;
    if (validPeopleToInsert.length > 0) {
      const { error: insertErr } = await admin
        .from('people')
        .insert(validPeopleToInsert);

      if (insertErr) {
        console.error('Batch insert error:', insertErr);
        await admin.from('import_batches').update({
          status: 'failed',
          summary: { error: insertErr.message },
        }).eq('id', batchId);

        return NextResponse.json(
          { error: `Database insert failed: ${insertErr.message}` },
          { status: 500 }
        );
      }
      successCount = validPeopleToInsert.length;
    }

    // 5. Store import errors if any
    if (errorRecords.length > 0) {
      await admin.from('import_errors').insert(errorRecords);
    }

    // 6. Finalize batch summary
    const completedAt = new Date().toISOString();
    await admin.from('import_batches').update({
      completed_at: completedAt,
      status: 'completed',
      success_count: successCount,
      error_count: errorRecords.length,
      summary: {
        total: rows.length,
        created: successCount,
        errors: errorRecords.length,
      },
    }).eq('id', batchId);

    // 7. Audit log
    await recordAuditLog({
      action: 'MRF_DATA_IMPORTED',
      entityType: 'IMPORT_BATCH',
      entityId: batchId,
      outcome: errorRecords.length === 0 ? 'success' : 'warning',
      metadata: {
        category,
        total: rows.length,
        created: successCount,
        errors: errorRecords.length,
      },
    });

    return NextResponse.json({
      success: true,
      batch_id: batchId,
      total_rows: rows.length,
      success_count: successCount,
      error_count: errorRecords.length,
      errors: errorRecords.slice(0, 50), // Return sample of errors for UI
    });
  } catch (err: any) {
    console.error('Import processing error:', err);
    return NextResponse.json(
      { error: err.message || 'Server error processing data import.' },
      { status: 500 }
    );
  }
}
