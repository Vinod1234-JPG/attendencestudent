import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/utils/audit';
import { addDevAttendanceRecord, getDevStorage } from '@/lib/db/devStore';
import { isNameMatching } from '@/lib/utils/normalization';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const operationId = formData.get('operation_id') as string;
    const sessionId = formData.get('session_id') as string;
    const personId = formData.get('person_id') as string;
    const attendeeName = (formData.get('attendee_name') as string) || 'Attendee';
    const category = (formData.get('category') as string) || 'guide';
    const identifier = (formData.get('identifier') as string) || '';
    const capturedAtDevice = formData.get('captured_at_device') as string;
    const photoFile = formData.get('photo') as File | null;

    if (!operationId || !sessionId || !personId || !photoFile) {
      return NextResponse.json(
        { error: 'Missing required attendance submission fields or photograph.' },
        { status: 400 }
      );
    }

    const isPlaceholder =
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');

    const photoBuffer = Buffer.from(await photoFile.arrayBuffer());
    const base64Photo = `data:${photoFile.type || 'image/jpeg'};base64,${photoBuffer.toString('base64')}`;
    const nowIso = new Date().toISOString();

    if (isPlaceholder) {
      const devStore = getDevStorage();
      const person = devStore.people.find((p) => p.id === personId);

      if (person && attendeeName && !isNameMatching(attendeeName, person.name)) {
        return NextResponse.json(
          { error: `The name "${attendeeName}" does not match the registered record (${person.name}).` },
          { status: 400 }
        );
      }

      const devRecord = {
        id: `dev-rec-${operationId.slice(0, 8)}`,
        operation_id: operationId,
        captured_at_device: capturedAtDevice || nowIso,
        received_at_server: nowIso,
        status: 'confirmed',
        session_name: 'General Conclave Check-in Session',
        attendee: {
          id: personId,
          name: person?.name || attendeeName,
          category: (person?.category || category) as 'guide' | 'phd_scholar',
          identifier: person?.normalized_email || person?.phd_id || identifier,
          extra_details: person?.metadata || {},
        },
        photo: {
          available: true,
          signed_url: base64Photo,
          file_size: photoFile.size,
          content_type: photoFile.type || 'image/jpeg',
        },
      };

      addDevAttendanceRecord(devRecord);

      return NextResponse.json({
        success: true,
        message: 'Attendance recorded successfully',
        record_id: devRecord.id,
        attendee_name: devRecord.attendee.name,
        category: devRecord.attendee.category,
        attendance_time: devRecord.captured_at_device,
      });
    }

    const admin = createAdminClient();

    // 1-3. High concurrency optimization: Execute session check, person lookup, and duplicate check concurrently
    const [
      { data: session, error: sessErr },
      { data: person, error: personErr },
      { data: existingRecord },
    ] = await Promise.all([
      admin
        .from('event_sessions')
        .select('id, name, status, event_id')
        .eq('id', sessionId)
        .single(),
      admin
        .from('people')
        .select('id, name, category, normalized_email, phd_id')
        .eq('id', personId)
        .single(),
      admin
        .from('attendance_records')
        .select('id, operation_id, captured_at_device')
        .eq('session_id', sessionId)
        .eq('person_id', personId)
        .maybeSingle(),
    ]);

    if (sessErr || !session || session.status !== 'open') {
      return NextResponse.json(
        { error: 'This attendance session is closed. Attendance cannot be recorded.' },
        { status: 400 }
      );
    }

    if (personErr || !person) {
      return NextResponse.json(
        { error: 'Attendee record not found.' },
        { status: 404 }
      );
    }

    // 2b. Strictly verify that attendee_name matches the person's registered name
    if (attendeeName && !isNameMatching(attendeeName, person.name)) {
      return NextResponse.json(
        { error: `The name "${attendeeName}" does not match the registered record (${person.name}).` },
        { status: 400 }
      );
    }

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

    // 6 & 7. Concurrency optimization: persist photo metadata and audit log in parallel
    await Promise.allSettled([
      admin.from('attendance_photos').insert({
        attendance_record_id: newRecord.id,
        storage_object_key: storageKey,
        content_type: photoFile.type || 'image/jpeg',
        file_size: photoFile.size,
        status: 'active',
      }),
      recordAuditLog({
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
      }),
    ]);

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
