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

    const admin = isPlaceholder ? null : createAdminClient();

    // 1. Fetch existing identifiers from Database to detect existing people
    const existingIdentifiers = new Set<string>();
    if (admin) {
      if (category === 'guide') {
        const { data: existingGuides } = await admin
          .from('people')
          .select('normalized_email')
          .eq('category', 'guide');
        if (existingGuides) {
          existingGuides.forEach((g) => {
            if (g.normalized_email) existingIdentifiers.add(g.normalized_email.toLowerCase());
          });
        }
      } else {
        const { data: existingScholars } = await admin
          .from('people')
          .select('phd_id')
          .eq('category', 'phd_scholar');
        if (existingScholars) {
          existingScholars.forEach((s) => {
            if (s.phd_id) existingIdentifiers.add(s.phd_id.toUpperCase());
          });
        }
      }
    }

    const newPeopleToInsert: any[] = [];
    const existingPeopleToUpdate: any[] = [];
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

        const personPayload = {
          category: 'guide',
          name,
          normalized_email: normalized,
          metadata,
        };

        if (existingIdentifiers.has(normalized)) {
          existingPeopleToUpdate.push(personPayload);
        } else {
          newPeopleToInsert.push({
            id: crypto.randomUUID(),
            ...personPayload,
          });
        }
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

        const personPayload = {
          category: 'phd_scholar',
          name,
          phd_id: normalized,
          metadata,
        };

        if (existingIdentifiers.has(normalized)) {
          existingPeopleToUpdate.push(personPayload);
        } else {
          newPeopleToInsert.push({
            id: crypto.randomUUID(),
            ...personPayload,
          });
        }
      }
    });

    if (isPlaceholder) {
      addDevPeople([...newPeopleToInsert, ...existingPeopleToUpdate]);
      return NextResponse.json({
        success: true,
        batch_id: `dev-batch-${Date.now()}`,
        total_rows: rows.length,
        created_count: newPeopleToInsert.length,
        updated_count: existingPeopleToUpdate.length,
        success_count: newPeopleToInsert.length + existingPeopleToUpdate.length,
        error_count: errorRecords.length,
        errors: errorRecords.slice(0, 50),
      });
    }

    // Live Supabase Commit
    // 1. Create import_batch record
    const { data: batch, error: batchErr } = await admin!
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

    // 2. Insert genuinely new records
    if (newPeopleToInsert.length > 0) {
      const peopleForDb = newPeopleToInsert.map((p) => ({
        ...p,
        import_batch_id: batchId,
      }));
      const { error: insertErr } = await admin!.from('people').insert(peopleForDb);
      if (insertErr) {
        console.error('Insert new people error:', insertErr);
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
    }

    // 3. Update existing records with new metadata/name in concurrent batches
    const CHUNK_SIZE = 15;
    for (let i = 0; i < existingPeopleToUpdate.length; i += CHUNK_SIZE) {
      const chunk = existingPeopleToUpdate.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map((p) => {
          const matchCol = category === 'guide' ? 'normalized_email' : 'phd_id';
          const matchVal = category === 'guide' ? p.normalized_email : p.phd_id;
          return admin!
            .from('people')
            .update({
              name: p.name,
              metadata: p.metadata,
              import_batch_id: batchId,
              updated_at: new Date().toISOString(),
            })
            .eq('category', category)
            .eq(matchCol, matchVal);
        })
      );
    }

    // 4. Update import batch summary
    const completedAt = new Date().toISOString();
    const totalSuccessful = newPeopleToInsert.length + existingPeopleToUpdate.length;
    await admin!
      .from('import_batches')
      .update({
        completed_at: completedAt,
        status: 'completed',
        success_count: totalSuccessful,
        error_count: errorRecords.length,
        summary: {
          total: rows.length,
          created: newPeopleToInsert.length,
          updated: existingPeopleToUpdate.length,
          errors: errorRecords.length,
        },
      })
      .eq('id', batchId);

    await recordAuditLog({
      action: 'MRF_DATA_IMPORTED',
      entityType: 'IMPORT_BATCH',
      entityId: batchId,
      outcome: 'success',
      metadata: {
        category,
        created: newPeopleToInsert.length,
        updated: existingPeopleToUpdate.length,
        total: rows.length,
      },
    });

    return NextResponse.json({
      success: true,
      batch_id: batchId,
      total_rows: rows.length,
      created_count: newPeopleToInsert.length,
      updated_count: existingPeopleToUpdate.length,
      success_count: totalSuccessful,
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
