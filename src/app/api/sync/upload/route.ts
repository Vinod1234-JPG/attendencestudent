import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/utils/audit';
import { cleanDisplayText, validateStudentDetails } from '@/lib/utils/normalization';
import { findOrCreateStudent, findStudent } from '@/lib/students/findOrCreateStudent';
import { emitRegistration } from '@/lib/live-bus';
import { getCurrentAdmin } from '@/lib/auth/requireAdmin';
import { getEventRoomFor } from '@/lib/staff/eventRoom';

/**
 * Stores a check-in that the kiosk saved on the device first (every kiosk check-in goes this way, so the student
 * sees "recorded" instantly; offline check-ins arrive here when the connection is back).
 *
 * The checks run in the same order as before (already synced → already checked in → session closed), but
 * lookups that do not depend on each other run together, so a check-in needs about 4 database round trips
 * one after another instead of about 11.
 */
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

    if (!personId) {
      const invalid = validateStudentDetails(studentName, college);
      if (invalid) {
        return NextResponse.json({ error: invalid }, { status: 400 });
      }
    }

    const admin = createAdminClient();
    // The teacher/admin signed in on the kiosk browser that is uploading owns these registrations.
    const operator = await getCurrentAdmin().catch(() => null);
    const registeredBy = operator?.id ?? null;
    const nowIso = new Date().toISOString();

    // Round 1: everything that only needs the request itself
    const [{ data: existingByOp }, { data: session }, eventRoom, foundStudent, photoBuffer] = await Promise.all([
      admin.from('attendance_records').select('id, session_id, person_id, created_at').eq('operation_id', operationId).maybeSingle(),
      admin.from('event_sessions').select('id, status, name').eq('id', sessionId).maybeSingle(),
      personId ? Promise.resolve('') : getEventRoomFor(admin, registeredBy),
      personId ? Promise.resolve(null) : findStudent(admin, studentName, college),
      photoFile.arrayBuffer().then((b) => Buffer.from(b)),
    ]);

    // 1. Idempotency: this very check-in was stored already (a retry)
    if (existingByOp) {
      return NextResponse.json({
        success: true,
        is_idempotent_replay: true,
        record_id: existingByOp.id,
        message: 'Operation already synchronized successfully.',
      });
    }

    // Students captured on the device have no record yet: register them now.
    // When the kiosk already knew the person (returning student), the stored name is read later for the Live Display.
    const knownPerson = !!personId;
    let personName = knownPerson ? '' : foundStudent?.name || studentName;
    let personCollege = knownPerson ? '' : foundStudent?.college || college;
    let createdNow = false;
    if (!personId) {
      const person =
        foundStudent ??
        (await findOrCreateStudent(admin, studentName, college, registeredBy, eventRoom, { alreadyLookedUp: true }));
      personId = person.id;
      personName = person.name;
      personCollege = person.college;
      createdNow = person.created;
    }

    // 2. Duplicate: this person already checked in this session (impossible for a student created just now)
    if (!createdNow) {
      const { data: existingPersonRecord } = await admin
        .from('attendance_records')
        .select('id, operation_id, captured_at_device')
        .eq('session_id', sessionId)
        .eq('person_id', personId)
        .maybeSingle();

      if (existingPersonRecord) {
        // Conflict: another kiosk/session already recorded this person!
        const { data: person } = await admin.from('people').select('name').eq('id', personId).maybeSingle();

        await Promise.all([
          admin.from('sync_conflicts').insert({
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
          }),
          recordAuditLog({
            action: 'SYNC_CONFLICT_DETECTED',
            entityType: 'ATTENDANCE',
            entityId: personId,
            outcome: 'warning',
            metadata: {
              operationId,
              conflictType: 'duplicate_submission',
              personName: person?.name,
            },
          }),
        ]);

        return NextResponse.json(
          {
            conflict: true,
            message: `Conflict: Person (${person?.name || personId}) was already recorded in this session. Flagged for administrative review.`,
          },
          { status: 409 }
        );
      }
    }

    // 3. Session closed while the check-in was waiting
    if (session && session.status !== 'open') {
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

    // 4 + 5. Upload the photo and insert the record at the same time
    const storageKey = `photos/${sessionId}/${personId}_${operationId}.jpg`;
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

    let [{ data: record, error: insertErr }, { error: uploadErr }] = await Promise.all([
      insertRecord(registeredBy ? { registered_by: registeredBy } : {}),
      admin.storage.from('mrf-attendance-photos').upload(storageKey, photoBuffer, {
        contentType: photoFile.type || 'image/jpeg',
        upsert: true,
      }),
    ]);
    // The teachers migration (00004) has not been run yet: still record the check-in, just without an owner.
    if (insertErr?.code === '42703' && registeredBy) {
      ({ data: record, error: insertErr } = await insertRecord({}));
    }

    if (uploadErr) {
      console.warn('Storage upload notice during sync:', uploadErr.message);
    }

    if (insertErr || !record) {
      const isDuplicate =
        insertErr?.code === '23505' ||
        insertErr?.message?.includes('duplicate key') ||
        insertErr?.message?.includes('uq_session_person');
      if (isDuplicate) {
        // Caught by the database unique rule (two kiosks at the same moment, or a retry of this same check-in)
        const { data: sameOp } = await admin
          .from('attendance_records')
          .select('id')
          .eq('operation_id', operationId)
          .maybeSingle();
        if (sameOp) {
          return NextResponse.json({
            success: true,
            is_idempotent_replay: true,
            record_id: sameOp.id,
            message: 'Operation already synchronized successfully.',
          });
        }
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
      // Not recorded: do not leave the photo behind (a retry uploads it again)
      if (!uploadErr) await admin.storage.from('mrf-attendance-photos').remove([storageKey]).catch(() => null);
      console.error('Sync insert failure:', insertErr);
      return NextResponse.json(
        { error: 'Database error storing synchronized attendance record.' },
        { status: 500 }
      );
    }

    // 6 + 7. Photo metadata and audit log together
    const [{ error: photoMetaErr }] = await Promise.all([
      admin.from('attendance_photos').insert({
        attendance_record_id: record.id,
        storage_object_key: storageKey,
        content_type: photoFile.type || 'image/jpeg',
        file_size: photoFile.size,
        status: 'active',
      }),
      recordAuditLog({
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
      }),
    ]);

    // Tell the Live Display (students only) once the record AND photo are stored.
    if (category === 'student' && !uploadErr && !photoMetaErr) {
      let who = { name: personName, college: personCollege };
      if (!who.name) {
        const { data } = await admin.from('people').select('name, college').eq('id', personId).maybeSingle();
        who = { name: data?.name || '', college: data?.college || '' };
      }
      if (who.name) {
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
