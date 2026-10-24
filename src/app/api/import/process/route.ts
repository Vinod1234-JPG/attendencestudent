import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeEmail, isValidEmail, normalizePhdId, isValidPhdId } from '@/lib/utils/normalization';
import { recordAuditLog } from '@/lib/utils/audit';
import { addDevPeople } from '@/lib/db/devStore';

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

    const isPlaceholder =
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');

    const validPeopleToInsert: any[] = [];
    const errorRecords: any[] = [];
    const seenInFile = new Set<string>();

    rows.forEach((row: any, index: number) => {
      const rowNumber = index + 1;
      const rawName = row.name || row.Name || row['Full Name'] || row['Attendee Name'] || '';
      const name = String(rawName).trim();

      if (!name) {
        errorRecords.push({
          row_number: rowNumber,
          error_type: 'MISSING_NAME',
          message: 'The attendee name is missing or blank.',
          diagnostic_details: row,
        });
        return;
      }

      // Collect all remaining columns as metadata (e.g. Commerce, Department, Mobile, Topic, etc.)
      const metadata: Record<string, any> = { ...row };
      delete metadata.name;
      delete metadata.Name;
      delete metadata['Full Name'];

      if (category === 'guide') {
        const rawEmail = row.email || row.Email || row['Email Address'] || '';
        const normalized = normalizeEmail(String(rawEmail));
        delete metadata.email;
        delete metadata.Email;
        delete metadata['Email Address'];

        if (!normalized || !isValidEmail(normalized)) {
          errorRecords.push({
            row_number: rowNumber,
            error_type: 'INVALID_EMAIL',
            message: `Invalid or missing email address: "${rawEmail}".`,
            diagnostic_details: row,
          });
          return;
        }

        if (seenInFile.has(normalized)) {
          errorRecords.push({
            row_number: rowNumber,
            error_type: 'FILE_DUPLICATE_EMAIL',
            message: `Duplicate email within the uploaded file: "${normalized}".`,
            diagnostic_details: row,
          });
          return;
        }

        seenInFile.add(normalized);
        validPeopleToInsert.push({
          id: `guide-${Date.now()}-${index}`,
          category: 'guide',
          name,
          normalized_email: normalized,
          metadata,
        });
      } else {
        // PhD Scholar
        const rawId = row.phd_id || row['PhD ID'] || row['Ph.D ID'] || row.id || row.ID || '';
        const normalized = normalizePhdId(String(rawId));
        delete metadata.phd_id;
        delete metadata['PhD ID'];
        delete metadata['Ph.D ID'];

        if (!normalized || !isValidPhdId(normalized)) {
          errorRecords.push({
            row_number: rowNumber,
            error_type: 'INVALID_PHD_ID',
            message: `Invalid or missing PhD ID: "${rawId}".`,
            diagnostic_details: row,
          });
          return;
        }

        if (seenInFile.has(normalized)) {
          errorRecords.push({
            row_number: rowNumber,
            error_type: 'FILE_DUPLICATE_PHD_ID',
            message: `Duplicate PhD ID within the uploaded file: "${normalized}".`,
            diagnostic_details: row,
          });
          return;
        }

        seenInFile.add(normalized);
        validPeopleToInsert.push({
          id: `scholar-${Date.now()}-${index}`,
          category: 'phd_scholar',
          name,
          phd_id: normalized,
          metadata,
        });
      }
    });

    if (isPlaceholder) {
      addDevPeople(validPeopleToInsert);
      return NextResponse.json({
        success: true,
        batch_id: `dev-batch-${Date.now()}`,
        total_rows: rows.length,
        success_count: validPeopleToInsert.length,
        error_count: errorRecords.length,
        errors: errorRecords.slice(0, 50),
      });
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
    const peopleForDb = validPeopleToInsert.map((p) => ({
      ...p,
      import_batch_id: batchId,
    }));

    if (peopleForDb.length > 0) {
      const { error: insertErr } = await admin.from('people').insert(peopleForDb);
      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
    }

    const completedAt = new Date().toISOString();
    await admin
      .from('import_batches')
      .update({
        completed_at: completedAt,
        status: 'completed',
        success_count: validPeopleToInsert.length,
        error_count: errorRecords.length,
      })
      .eq('id', batchId);

    return NextResponse.json({
      success: true,
      batch_id: batchId,
      total_rows: rows.length,
      success_count: validPeopleToInsert.length,
      error_count: errorRecords.length,
      errors: errorRecords.slice(0, 50),
    });
  } catch (err: any) {
    console.error('Import processing error:', err);
    return NextResponse.json(
      { error: err.message || 'Server error processing data import.' },
      { status: 500 }
    );
  }
}
