import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/utils/audit';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const operationId = formData.get('operation_id') as string;
    const sessionId = formData.get('session_id') as string;
    const personId = formData.get('person_id') as string;
    const capturedAtDevice = formData.get('captured_at_device') as string;
    const photoFile = formData.get('photo') as File | null;

    if (!operationId || !sessionId || !personId || !photoFile) {
      return NextResponse.json(
        { error: 'Missing required attendance submission fields or photograph.' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // 1. Verify session is still open
    const { data: session, error: sessErr } = await admin
      .from('event_sessions')
      .select('id, name, status, event_id')
      .eq('id', sessionId)
      .single();

    if (sessErr || !session || session.status !== 'open') {
      return NextResponse.json(
        { error: 'This attendance session is closed. Attendance cannot be recorded.' },
        { status: 400 }
      );
    }

    // 2. Verify person exists
    const { data: person, error: personErr } = await admin
      .from('people')
      .select('id, name, category, normalized_email, phd_id')
      .eq('id', personId)
      .single();

    if (personErr || !person) {
      return NextResponse.json(
        { error: 'Attendee record not found.' },
        { status: 404 }
      );
    }

    // 3. Check for existing attendance record (Idempotent check and duplicate prevention)
    const { data: existingRecord } = await admin
      .from('attendance_records')
      .select('id, operation_id, captured_at_device')
      .eq('session_id', sessionId)
      .eq('person_id', personId)
      .maybeSingle();

    if (existingRecord) {
      // If the same operation_id is sent again, return success idempotently
      if (existingRecord.operation_id === operationId) {
        return NextResponse.json({
          success: true,
          message: 'Attendance record previously processed.',
          record_id: existingRecord.id,
          attendee_name: person.name,
          category: person.category,
          captured_at: existingRecord.captured_at_device,
        });
      }

      // If a different operation tried to submit for the same person
      await recordAuditLog({
        action: 'ATTENDANCE_DUPLICATE_REJECTED',
        entityType: 'ATTENDANCE',
        entityId: personId,
        outcome: 'warning',
        metadata: {
          sessionId,
          personName: person.name,
          category: person.category,
        },
      });

      return NextResponse.json(
        {
          error: `Attendance has already been recorded for ${person.name}. Duplicate entries are not permitted.`,
        },
        { status: 409 }
      );
    }

    // 4. Upload photo to private Supabase Storage
    const photoBuffer = Buffer.from(await photoFile.arrayBuffer());
    const storageKey = `photos/${sessionId}/${personId}_${operationId}.jpg`;

    const { error: uploadErr } = await admin.storage
      .from('mrf-attendance-photos')
      .upload(storageKey, photoBuffer, {
        contentType: photoFile.type || 'image/jpeg',
        upsert: true,
      });

    if (uploadErr) {
      console.warn('Storage upload error (fallback active if using mock):', uploadErr.message);
    }

    // 5. Insert Attendance Record
    const nowIso = new Date().toISOString();
    const { data: newRecord, error: insertErr } = await admin
      .from('attendance_records')
      .insert({
        session_id: sessionId,
        person_id: personId,
        operation_id: operationId,
        captured_at_device: capturedAtDevice || nowIso,
        received_at_server: nowIso,
        recorded_at_server: nowIso,
        status: 'confirmed',
      })
      .select('id, session_id, person_id, captured_at_device')
      .single();

    if (insertErr || !newRecord) {
      console.error('Attendance insert error:', insertErr);
      return NextResponse.json(
        { error: 'Failed to record attendance in database.' },
        { status: 500 }
      );
    }

    // 6. Insert Attendance Photo Metadata
    const { error: photoMetaErr } = await admin.from('attendance_photos').insert({
      attendance_record_id: newRecord.id,
      storage_object_key: storageKey,
      content_type: photoFile.type || 'image/jpeg',
      file_size: photoFile.size,
      status: 'active',
    });

    if (photoMetaErr) {
      console.warn('Photo metadata insert error:', photoMetaErr.message);
    }

    // 7. Audit log entry
    await recordAuditLog({
      action: 'ATTENDANCE_RECORDED',
      entityType: 'ATTENDANCE',
      entityId: newRecord.id,
      outcome: 'success',
      metadata: {
        sessionId,
        personId,
        personName: person.name,
        category: person.category,
        operationId,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Attendance recorded successfully',
      record_id: newRecord.id,
      attendee_name: person.name,
      category: person.category,
      attendance_time: newRecord.captured_at_device,
    });
  } catch (err: any) {
    console.error('Online attendance submit exception:', err);
    return NextResponse.json(
      { error: err.message || 'Server error recording attendance.' },
      { status: 500 }
    );
  }
}
