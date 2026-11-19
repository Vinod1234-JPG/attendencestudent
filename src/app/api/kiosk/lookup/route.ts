import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDevStorage } from '@/lib/db/devStore';
import { isPlaceholderMode } from '@/lib/auth/adminSession';
import { buildStudentKey, cleanDisplayText, validateStudentDetails } from '@/lib/utils/normalization';
import { CONFIG_HELP, SupabaseConfigError } from '@/lib/supabase/config';
import { findOrCreateDevStudent } from '@/lib/students/findOrCreateStudent';

export const dynamic = 'force-dynamic';

type Admin = ReturnType<typeof createAdminClient>;

interface KioskState {
  event: { id: string; name: string; kiosk_enabled: boolean } | null;
  session: { id: string; name: string } | null;
  error?: string;
}

// The active event and open session change rarely (admin action), but every student asks. Remember them for a
// few seconds so a lookup is one database round trip instead of three.
const STATE_TTL_MS = 15_000;
let stateCache: { state: KioskState; at: number } | null = null;

async function kioskState(admin: Admin): Promise<KioskState> {
  if (stateCache && Date.now() - stateCache.at < STATE_TTL_MS) return stateCache.state;

  const { data: event, error: eventErr } = await admin
    .from('events')
    .select('id, name, status, kiosk_enabled')
    .eq('status', 'active')
    .maybeSingle();
  if (eventErr) return { event: null, session: null, error: eventErr.message }; // not cached

  let session: KioskState['session'] = null;
  if (event) {
    const { data } = await admin
      .from('event_sessions')
      .select('id, name, status')
      .eq('event_id', event.id)
      .eq('status', 'open')
      .maybeSingle();
    session = data ? { id: data.id, name: data.name } : null;
  }

  const state: KioskState = {
    event: event ? { id: event.id, name: event.name, kiosk_enabled: !!event.kiosk_enabled } : null,
    session,
  };
  stateCache = { state, at: Date.now() };
  return state;
}

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

    // The kiosk state and the student (with their check-ins) do not depend on each other: fetch them together.
    const [state, studentRes] = await Promise.all([
      kioskState(admin),
      admin
        .from('people')
        .select('id, name, college, attendance_records ( session_id )')
        .eq('category', 'student')
        .eq('student_key', buildStudentKey(name, college))
        .maybeSingle(),
    ]);

    if (state.error) {
      console.error('Kiosk lookup: events query failed:', state.error);
      return NextResponse.json({ error: CONFIG_HELP }, { status: 503 });
    }

    if (!state.event) {
      return NextResponse.json(
        { error: 'No active event is configured. Please contact the administrator.' },
        { status: 400 }
      );
    }

    if (!state.event.kiosk_enabled) {
      return NextResponse.json(
        { error: 'The attendance kiosk is currently paused by the administrator.' },
        { status: 403 }
      );
    }

    const session = state.session;
    if (!session) {
      return NextResponse.json(
        { error: 'The attendance session is currently closed.' },
        { status: 400 }
      );
    }

    const existing: any = studentRes.data || null;
    const records: any[] = Array.isArray(existing?.attendance_records)
      ? existing.attendance_records
      : existing?.attendance_records
      ? [existing.attendance_records]
      : [];
    const alreadyAttended = records.some((r) => r?.session_id === session.id);

    return NextResponse.json({
      success: true,
      person: {
        id: existing?.id || null,
        name: existing?.name || name,
        college: existing?.college || college,
        category: 'student',
      },
      event: { id: state.event.id, name: state.event.name },
      session: { id: session.id, name: session.name },
      already_attended: alreadyAttended,
    });
  } catch (err) {
    console.error('Kiosk lookup exception:', err);
    if (err instanceof SupabaseConfigError) {
      return NextResponse.json({ error: CONFIG_HELP }, { status: 503 });
    }
    return NextResponse.json(
      { error: 'Server error checking student details.' },
      { status: 500 }
    );
  }
}
