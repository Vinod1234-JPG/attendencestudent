import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/utils/audit';
import { addDevAttendanceRecord, getDevStorage } from '@/lib/db/devStore';
import { isPlaceholderMode } from '@/lib/auth/adminSession';
import { cleanDisplayText, validateStudentDetails } from '@/lib/utils/normalization';
import { findOrCreateDevStudent, findOrCreateStudent, findStudent } from '@/lib/students/findOrCreateStudent';
import { emitRegistration } from '@/lib/live-bus';
import { getCurrentAdmin } from '@/lib/auth/requireAdmin';

export const dynamic = 'force-dynamic';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Records a student's attendance. First-time students (name + college not seen
 * before) are registered here, in the same request.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const operationId = formData.get('operation_id') as string;
    const sessionId = formData.get('session_id') as string;
    const studentName = cleanDisplayText(formData.get('attendee_name') as string);
    const college = cleanDisplayText(formData.get('college') as string);
    const capturedAtDevice = formData.get('captured_at_device') as string;
    const photoFile = formData.get('photo') as File | null;

    if (!operationId || !sessionId || !photoFile) {
      return NextResponse.json(
        { error: 'Missing required attendance submission fields or photograph.' },
        { status: 400 }
      );
    }

    const invalid = validateStudentDetails(studentName, college);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }

    const photoType = photoFile.type || 'image/jpeg';
    if (!ALLOWED_PHOTO_TYPES.includes(photoType) || photoFile.size === 0 || photoFile.size > MAX_PHOTO_BYTES) {
      return NextResponse.json(
        { error: 'The attendance photo is missing or invalid. Please retake your photo.' },
        { status: 400 }
      );
    }

    const photoBuffer = Buffer.from(await photoFile.arrayBuffer());
    const nowIso = new Date().toISOString();

    // ------------------------------------------------------------------
    // Development store (no Supabase configured)
    // ------------------------------------------------------------------
    if (isPlaceholderMode()) {
      const person = findOrCreateDevStudent(studentName, college)!;

      if (getDevStorage().attendanceRecords.some((r) => r.attendee.id === person.id)) {
        return NextResponse.json(
          { error: `Attendance has already been recorded for ${person.name}. Duplicate entries are not permitted.` },
          { status: 409 }
        );
      }

      const devRecord = {
        id: `dev-rec-${operationId.slice(0, 8)}`,
        operation_id: operationId,
        captured_at_device: capturedAtDevice || nowIso,
        received_at_server: nowIso,
        status: 'confirmed',
        session_name: 'General Check-in Session',
        attendee: {
          id: person.id,
          name: person.name,
          category: 'student' as const,
          identifier: person.college || college,
          extra_details: person.metadata || {},
        },
        photo: {
          available: true,
          signed_url: `data:${photoType};base64,${photoBuffer.toString('base64')}`,
          file_size: photoFile.size,
          content_type: photoType,
        },
      };

      addDevAttendanceRecord(devRecord);

      emitRegistration({
        attendeeId: person.id,
        name: person.name,
        college: person.college || college,
        photoUrl: devRecord.photo.signed_url,
        capturedAt: devRecord.captured_at_device,
        ownerId: null,
      });

      return NextResponse.json({
        success: true,
        message: 'Attendance recorded successfully',
        record_id: devRecord.id,
        attendee_name: person.name,
        category: 'student',
        attendance_time: devRecord.captured_at_device,
      });
    }

    // ------------------------------------------------------------------
    // Live (Supabase)
    // ------------------------------------------------------------------
    const admin = createAdminClient();

    // Who is operating this kiosk? A teacher/admin signed in on this browser owns the registration.
    const operator = await getCurrentAdmin().catch(() => null);
    const registeredBy = operator?.id ?? null;

    // The session check and the student lookup do not depend on each other: run them together.
    const [{ data: session, error: sessErr }, existingStudent] = await Promise.all([
      admin.from('event_sessions').select('id, name, status, event_id').eq('id', sessionId).single(),
      findStudent(admin, studentName, college),
    ]);

    if (sessErr || !session || session.status !== 'open') {
      return NextResponse.json(
        { error: 'This attendance session is closed. Attendance cannot be recorded.' },
        { status: 400 }
      );
    }

    // Only register a first-time student once we know the session is open.
    const person = existingStudent ?? (await findOrCreateStudent(admin, studentName, college, registeredBy));
    const personId = person.id;

    if (person.created) {
      recordAuditLog({
        action: 'STUDENT_SELF_REGISTERED',
        entityType: 'PERSON',
        entityId: personId,
        outcome: 'success',
        metadata: { name: person.name, college: person.college },
      });
    }

    const { data: existingRecord } = await admin
      .from('attendance_records')
      .select('id, operation_id, captured_at_device')
      .eq('session_id', sessionId)
      .eq('person_id', personId)
      .maybeSingle();

    if (existingRecord) {
      // Same operation re-sent: answer idempotently.
      if (existingRecord.operation_id === operationId) {
        return NextResponse.json({
          success: true,
          message: 'Attendance record previously processed.',
          record_id: existingRecord.id,
          attendee_name: person.name,
          category: 'student',
          captured_at: existingRecord.captured_at_device,
        });
      }

      await recordAuditLog({
        action: 'ATTENDANCE_DUPLICATE_REJECTED',
        entityType: 'ATTENDANCE',
        entityId: personId,
        outcome: 'warning',
        metadata: { sessionId, personName: person.name, college: person.college },
      });

      return NextResponse.json(
        {
          error: `Attendance has already been recorded for ${person.name} (${person.college}). Duplicate entries are not permitted.`,
        },
        { status: 409 }
      );
    }

    const storageKey = `photos/${sessionId}/${personId}_${operationId}.jpg`;

    const { error: uploadErr } = await admin.storage
      .from('mrf-attendance-photos')
      .upload(storageKey, photoBuffer, { contentType: photoType, upsert: true });

    if (uploadErr) {
      console.warn('Storage upload error:', uploadErr.message);
    }

    const recordFields = {
      session_id: sessionId,
      person_id: personId,
      operation_id: operationId,
      captured_at_device: capturedAtDevice || nowIso,
      received_at_server: nowIso,
      recorded_at_server: nowIso,
      status: 'confirmed',
    };
    const insertRecord = (extra: Record<string, unknown>) =>
      admin
        .from('attendance_records')
        .insert({ ...recordFields, ...extra })
        .select('id, session_id, person_id, captured_at_device')
        .single();
    let { data: newRecord, error: insertErr } = await insertRecord(registeredBy ? { registered_by: registeredBy } : {});
    // The teachers migration (00004) has not been run yet: still record the check-in, just without an owner.
    if (insertErr?.code === '42703' && registeredBy) {
      ({ data: newRecord, error: insertErr } = await insertRecord({}));
    }

    if (insertErr || !newRecord) {
      // 23505: another kiosk recorded the same student at the same moment.
      if (
        insertErr?.code === '23505' ||
        insertErr?.message?.includes('duplicate key') ||
        insertErr?.message?.includes('uq_session_person')
      ) {
        return NextResponse.json(
          {
            error: `Attendance has already been recorded for ${person.name} on another system. Duplicate entries are not permitted.`,
            duplicate: true,
          },
          { status: 409 }
        );
      }

      console.error('Attendance insert error:', insertErr);
      return NextResponse.json({ error: 'Failed to record attendance in database.' }, { status: 500 });
    }

    const [photoInsert] = await Promise.allSettled([
      admin.from('attendance_photos').insert({
        attendance_record_id: newRecord.id,
        storage_object_key: storageKey,
        content_type: photoType,
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
          college: person.college,
          category: 'student',
          operationId,
        },
      }),
    ]);

    // Tell the Live Display, but only once the record AND its photo are safely stored.
    const photoSaved =
      !uploadErr && photoInsert.status === 'fulfilled' && !(photoInsert.value as { error?: unknown }).error;
    if (photoSaved) {
      emitRegistration({
        attendeeId: personId,
        name: person.name,
        college: person.college,
        photoUrl: `/api/attendance/photo?key=${encodeURIComponent(storageKey)}`,
        capturedAt: newRecord.captured_at_device,
        ownerId: registeredBy,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Attendance recorded successfully',
      record_id: newRecord.id,
      attendee_name: person.name,
      category: 'student',
      attendance_time: newRecord.captured_at_device,
    });
  } catch (err) {
    console.error('Online attendance submit exception:', err);
    return NextResponse.json({ error: 'Server error recording attendance.' }, { status: 500 });
  }
}
