import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlaceholderMode } from '@/lib/auth/adminSession';
import { CONFIG_HELP, SupabaseConfigError } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';

/**
 * Prepares a kiosk to work without internet. Students self-register, so a kiosk
 * only needs the active event and open session; no student list is sent
 * (keeps everyone's details off public devices).
 */
export async function GET() {
  try {
    if (isPlaceholderMode()) {
      return NextResponse.json({
        success: true,
        dataset_version: 2,
        generated_at: new Date().toISOString(),
        event: {
          id: 'dev-event-1',
          name: 'MIT Mysore Student Attendance',
          event_date: new Date().toISOString().slice(0, 10),
          timezone: 'Asia/Kolkata',
          status: 'active',
          kiosk_enabled: true,
          offline_allowed: true,
        },
        session: {
          id: 'dev-session-1',
          event_id: 'dev-event-1',
          name: 'General Check-in Session',
          status: 'open',
          opens_at: new Date().toISOString(),
          closes_at: null,
        },
        people: [],
      });
    }

    const admin = createAdminClient();

    const { data: event, error: eventErr } = await admin
      .from('events')
      .select('id, name, event_date, timezone, status, kiosk_enabled, offline_allowed')
      .eq('status', 'active')
      .maybeSingle();

    if (eventErr) {
      console.error('Offline prep: events query failed:', eventErr.message);
      return NextResponse.json({ error: CONFIG_HELP }, { status: 503 });
    }

    if (!event) {
      return NextResponse.json(
        { error: 'No active event found to prepare for offline kiosk.' },
        { status: 404 }
      );
    }

    if (!event.offline_allowed) {
      return NextResponse.json(
        { error: 'Offline kiosk mode is disabled for this event.' },
        { status: 403 }
      );
    }

    const { data: session, error: sessErr } = await admin
      .from('event_sessions')
      .select('id, event_id, name, status, opens_at, closes_at')
      .eq('event_id', event.id)
      .eq('status', 'open')
      .maybeSingle();

    if (sessErr || !session) {
      return NextResponse.json(
        { error: 'No open session found for the active event.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      dataset_version: 2,
      generated_at: new Date().toISOString(),
      event,
      session,
      people: [],
    });
  } catch (err) {
    console.error('Offline prep exception:', err);
    if (err instanceof SupabaseConfigError) {
      return NextResponse.json({ error: CONFIG_HELP }, { status: 503 });
    }
    return NextResponse.json(
      { error: 'Server error preparing offline dataset.' },
      { status: 500 }
    );
  }
}
