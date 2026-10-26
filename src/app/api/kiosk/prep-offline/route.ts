import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const isPlaceholder =
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');

    if (isPlaceholder) {
      const samplePeople = [
        {
          id: 'dev-guide-1',
          category: 'guide' as const,
          name: 'Prof. R. Natarajan',
          normalized_email: 'r.natarajan@mrf.org',
          phd_id: null,
        },
        {
          id: 'dev-guide-2',
          category: 'guide' as const,
          name: 'Dr. Sunita Kulkarni',
          normalized_email: 's.kulkarni@mrf.org',
          phd_id: null,
        },
        {
          id: 'dev-scholar-1',
          category: 'phd_scholar' as const,
          name: 'Aditya Verma',
          normalized_email: null,
          phd_id: 'MRF-PHD-2026-001',
        },
        {
          id: 'dev-scholar-2',
          category: 'phd_scholar' as const,
          name: 'Deepika Sharma',
          normalized_email: null,
          phd_id: 'MRF-PHD-2026-002',
        },
      ];

      return NextResponse.json({
        success: true,
        dataset_version: 1,
        generated_at: new Date().toISOString(),
        event: {
          id: 'dev-event-1',
          name: 'MRF Annual Research Conclave 2026',
          event_date: '2026-10-24',
          timezone: 'Asia/Kolkata',
          status: 'active',
          kiosk_enabled: true,
          offline_allowed: true,
        },
        session: {
          id: 'dev-session-1',
          event_id: 'dev-event-1',
          name: 'General Conclave Check-in Session',
          status: 'open',
          opens_at: new Date().toISOString(),
          closes_at: null,
        },
        people: samplePeople,
        counts: {
          guides: 2,
          scholars: 2,
          total: 4,
        },
      });
    }

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
    const { data: peopleRaw, error: peopleErr } = await admin
      .from('people')
      .select('*');

    if (peopleErr) {
      return NextResponse.json(
        { error: 'Failed to fetch registered attendees for offline preparation.' },
        { status: 500 }
      );
    }

    const people = (peopleRaw || []).sort((a: any, b: any) =>
      (a.name || '').localeCompare(b.name || '')
    );

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
