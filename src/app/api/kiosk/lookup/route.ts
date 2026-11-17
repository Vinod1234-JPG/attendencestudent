import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDevStorage } from '@/lib/db/devStore';
import { isPlaceholderMode } from '@/lib/auth/adminSession';
import { cleanDisplayText, validateStudentDetails } from '@/lib/utils/normalization';
import { findOrCreateDevStudent, findStudent } from '@/lib/students/findOrCreateStudent';

export const dynamic = 'force-dynamic';

/**
 * Kiosk step 2 → 3: checks the kiosk is open and whether this student
 * (name + college) has already been marked present. Creates nothing:
 * first-time students are registered when they confirm (see /api/kiosk/submit).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = cleanDisplayText(body?.name);
    const college = cleanDisplayText(body?.college);

    const invalid = validateStudentDetails(name, college);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }

    if (isPlaceholderMode()) {
      const existing = findOrCreateDevStudent(name, college, { create: false });
      const alreadyAttended =
        !!existing && getDevStorage().attendanceRecords.some((r) => r.attendee.id === existing.id);

      return NextResponse.json({
        success: true,
        person: {
          id: existing?.id || null,
          name: existing?.name || name,
          college: existing?.college || college,
          category: 'student',
        },
        event: { id: 'dev-event-1', name: 'MIT Mysore Student Attendance' },
        session: { id: 'dev-session-1', name: 'General Check-in Session' },
        already_attended: alreadyAttended,
      });
    }

    const admin = createAdminClient();

    const { data: event, error: eventErr } = await admin
      .from('events')
      .select('id, name, status, kiosk_enabled')
      .eq('status', 'active')
      .maybeSingle();

    if (eventErr || !event) {
      return NextResponse.json(
        { error: 'No active event is configured. Please contact the administrator.' },
        { status: 400 }
      );
    }

    if (!event.kiosk_enabled) {
      return NextResponse.json(
        { error: 'The attendance kiosk is currently paused by the administrator.' },
        { status: 403 }
      );
    }

    const { data: session, error: sessErr } = await admin
      .from('event_sessions')
      .select('id, name, status')
      .eq('event_id', event.id)
      .eq('status', 'open')
      .maybeSingle();

    if (sessErr || !session) {
      return NextResponse.json(
        { error: 'The attendance session is currently closed.' },
        { status: 400 }
      );
    }

    const existing = await findStudent(admin, name, college);

    let alreadyAttended = false;
    if (existing) {
      const { data: record } = await admin
        .from('attendance_records')
        .select('id')
        .eq('session_id', session.id)
        .eq('person_id', existing.id)
        .maybeSingle();
      alreadyAttended = !!record;
    }

    return NextResponse.json({
      success: true,
      person: {
        id: existing?.id || null,
        name: existing?.name || name,
        college: existing?.college || college,
        category: 'student',
      },
      event: { id: event.id, name: event.name },
      session: { id: session.id, name: session.name },
      already_attended: alreadyAttended,
    });
  } catch (err) {
    console.error('Kiosk lookup exception:', err);
    return NextResponse.json(
      { error: 'Server error checking student details.' },
      { status: 500 }
    );
  }
}
