import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/utils/audit';
import { cleanDisplayText, validateStudentDetails } from '@/lib/utils/normalization';
import { findOrCreateStudent } from '@/lib/students/findOrCreateStudent';
import { emitRegistration } from '@/lib/live-bus';
import { getCurrentAdmin } from '@/lib/auth/requireAdmin';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const operationId = formData.get('operation_id') as string;
    const sessionId = formData.get('session_id') as string;
    let personId = (formData.get('person_id') as string) || '';
    const category = (formData.get('category') as string) || 'student';
    const identifier = formData.get('identifier') as string;
    const studentName = cleanDisplayText(formData.get('attendee_name') as string);
    const college = cleanDisplayText(formData.get('college') as string);
    const capturedAtDevice = formData.get('captured_at_device') as string;
    const photoFile = formData.get('photo') as File | null;

    if (!operationId || !sessionId || !photoFile || (!personId && category !== 'student')) {
      return NextResponse.json(
        { error: 'Missing required sync operation payload or photo.' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    // The teacher/admin signed in on the kiosk browser that is uploading owns these registrations.
    const operator = await getCurrentAdmin().catch(() => null);
    const registeredBy = operator?.id ?? null;

    // Students captured offline have no record yet: register them now.
    if (!personId) {
      const invalid = validateStudentDetails(studentName, college);
      if (invalid) {
        return NextResponse.json({ error: invalid }, { status: 400 });
      }
      personId = (await findOrCreateStudent(admin, studentName, college, registeredBy)).id;
    }
    const nowIso = new Date().toISOString();

    // 1. Idempotency Check by operation_id
    const { data: existingByOp } = await admin
      .from('attendance_records')
      .select('id, session_id, person_id, created_at')
      .eq('operation_id', operationId)
      .maybeSingle();

    if (existingByOp) {
      return NextResponse.json({
        success: true,
        is_idempotent_replay: true,
        record_id: existingByOp.id,
        message: 'Operation already synchronized successfully.',
      });
    }

    // 2. Duplicate Check by (session_id, person_id)
    const { data: existingPersonRecord } = await admin
      .from('attendance_records')
      .select('id, operation_id, captured_at_device')
      .eq('session_id', sessionId)
      .eq('person_id', personId)
      .maybeSingle();

    if (existingPersonRecord) {
      // Conflict: another kiosk/session already recorded this person!
      const { data: person } = await admin
        .from('people')
        .select('name')
        .eq('id', personId)
        .maybeSingle();

      await admin.from('sync_conflicts').insert({
        operation_id: operationId,
        session_id: sessionId,
        person_id: personId,
        conflict_type: 'duplicate_submission',
        client_captured_at: capturedAtDevice,
        server_received_at: nowIso,
        status: 'pending_review',
        metadata: {
          existingRecordId: existingPersonRecord.id,
          existingCapturedAt: existingPersonRecord.captured_at_device,
          incomingCapturedAt: capturedAtDevice,
          category,
          identifier,
          personName: person?.name || 'Unknown',
        },
      });

      await recordAuditLog({
        action: 'SYNC_CONFLICT_DETECTED',
        entityType: 'ATTENDANCE',
        entityId: personId,
        outcome: 'warning',
        metadata: {
          operationId,
          conflictType: 'duplicate_submission',
          personName: person?.name,
        },
      });

      return NextResponse.json(
        {
          conflict: true,
          message: `Conflict: Person (${person?.name || personId}) was already recorded in this session. Flagged for administrative review.`,
        },
        { status: 409 }
      );
    }

    // 3. Check Session Status
    const { data: session } = await admin
      .from('event_sessions')
      .select('id, status, name')
      .eq('id', sessionId)
      .single();

    if (session && session.status !== 'open') {
      // Session closed while kiosk was offline!
      // As per Section 10.6, record capture timestamp and flag for administrative review
      await admin.from('sync_conflicts').insert({
        operation_id: operationId,
        session_id: sessionId,
        person_id: personId,
        conflict_type: 'session_closed',
        client_captured_at: capturedAtDevice,
        server_received_at: nowIso,
        status: 'pending_review',
        metadata: {
          reason: 'Session was closed prior to offline sync arrival',
          sessionName: session.name,
          category,
          identifier,
        },
      });

      return NextResponse.json(
        {
          conflict: true,
          message: 'The attendance session was closed prior to synchronization. Flagged for review.',
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
      console.warn('Storage upload notice during sync:', uploadErr.message);
    }

    // 5. Insert Attendance Record
    const recordFields = {
      session_id: sessionId,
      person_id: personId,
      operation_id: operationId,
      captured_at_device: capturedAtDevice,
      received_at_server: nowIso,
      recorded_at_server: nowIso,
      status: 'confirmed',
    };
    const insertRecord = (extra: Record<string, unknown>) =>
      admin.from('attendance_records').insert({ ...recordFields, ...extra }).select('id').single();
    let { data: record, error: insertErr } = await insertRecord(registeredBy ? { registered_by: registeredBy } : {});
    // The teachers migration (00004) has not been run yet: still record the check-in, just without an owner.
    if (insertErr?.code === '42703' && registeredBy) {
      ({ data: record, error: insertErr } = await insertRecord({}));
    }

    if (insertErr || !record) {
      if (
        insertErr?.code === '23505' ||
        insertErr?.message?.includes('duplicate key') ||
        insertErr?.message?.includes('uq_session_person')
      ) {
        await admin.from('sync_conflicts').insert({
          operation_id: operationId,
          session_id: sessionId,
          person_id: personId,
          conflict_type: 'duplicate_submission',
          client_captured_at: capturedAtDevice,
          server_received_at: nowIso,
          status: 'pending_review',
          metadata: {
            incomingCapturedAt: capturedAtDevice,
            category,
            identifier,
            reason: 'Concurrent insert duplicate caught by database unique constraint',
          },
        });
        return NextResponse.json(
          {
            conflict: true,
            message: 'Attendance was already recorded by another system. Marked as duplicate.',
          },
          { status: 409 }
        );
      }
      console.error('Sync insert failure:', insertErr);
      return NextResponse.json(
        { error: 'Database error storing synchronized attendance record.' },
        { status: 500 }
      );
    }

    // 6. Insert Photo Metadata
    const { error: photoMetaErr } = await admin.from('attendance_photos').insert({
      attendance_record_id: record.id,
      storage_object_key: storageKey,
      content_type: photoFile.type || 'image/jpeg',
      file_size: photoFile.size,
      status: 'active',
    });

    // Tell the Live Display (students only) once the record AND photo are stored.
    if (category === 'student' && !uploadErr && !photoMetaErr) {
      const { data: who } = await admin.from('people').select('name, college').eq('id', personId).maybeSingle();
      if (who?.name) {
        emitRegistration({
          attendeeId: personId,
          name: who.name,
          college: who.college || '',
          photoUrl: `/api/attendance/photo?key=${encodeURIComponent(storageKey)}`,
          capturedAt: capturedAtDevice,
          ownerId: registeredBy,
        });
      }
    }

    // 7. Audit Log
    await recordAuditLog({
      action: 'SYNC_ATTENDANCE_SUCCESS',
      entityType: 'ATTENDANCE',
      entityId: record.id,
      outcome: 'success',
      metadata: {
        operationId,
        personId,
        category,
        capturedAtDevice,
      },
    });

    return NextResponse.json({
      success: true,
      record_id: record.id,
      message: 'Attendance successfully synchronized with server.',
    });
  } catch (err: any) {
    console.error('Sync upload route error:', err);
    return NextResponse.json(
      { error: err.message || 'Sync endpoint server failure.' },
      { status: 500 }
    );
  }
}
