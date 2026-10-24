import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const admin = createAdminClient();

    // 1. Fetch active event
    const { data: event, error: eventErr } = await admin
      .from('events')
      .select('id, name, event_date, timezone, status, kiosk_enabled, offline_allowed')
      .eq('status', 'active')
      .maybeSingle();

    if (eventErr || !event) {
      return NextResponse.json(
        { error: 'No active event found to prepare for offline kiosk.' },
        { status: 404 }
      );
    }

    // 2. Fetch open session
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

    // 3. Fetch all registered people (Guides and PhD Scholars)
    const { data: people, error: peopleErr } = await admin
      .from('people')
      .select('id, category, name, normalized_email, phd_id')
      .order('name', { ascending: true });

    if (peopleErr) {
      return NextResponse.json(
        { error: 'Failed to fetch registered attendees for offline preparation.' },
        { status: 500 }
      );
    }

    const guideCount = people.filter((p) => p.category === 'guide').length;
    const scholarCount = people.filter((p) => p.category === 'phd_scholar').length;

    return NextResponse.json({
      success: true,
      dataset_version: 1,
      generated_at: new Date().toISOString(),
      event,
      session,
      people,
      counts: {
        guides: guideCount,
        scholars: scholarCount,
        total: people.length,
      },
    });
  } catch (err: any) {
    console.error('Offline prep exception:', err);
    return NextResponse.json(
      { error: err.message || 'Server error preparing offline dataset.' },
      { status: 500 }
    );
  }
}
