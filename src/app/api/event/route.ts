import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/utils/audit';

export async function GET() {
  try {
    const isPlaceholder =
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');

    if (isPlaceholder) {
      return NextResponse.json({
        success: true,
        event: {
          id: 'dev-event-1',
          name: 'MRF Research Retreat',
          event_date: '2026-10-24',
          timezone: 'Asia/Kolkata',
          status: 'active',
          kiosk_enabled: true,
          offline_allowed: true,
          photo_retention_days: 365,
        },
        session: {
          id: 'dev-session-1',
          event_id: 'dev-event-1',
          name: 'General Retreat Check-in Session',
          status: 'open',
          opens_at: new Date().toISOString(),
          closes_at: null,
        },
      });
    }

    const admin = createAdminClient();

    const { data: event, error: eventErr } = await admin
      .from('events')
      .select('*')
      .eq('status', 'active')
      .maybeSingle();

    if (eventErr) {
      return NextResponse.json({ error: eventErr.message }, { status: 500 });
    }

    let session = null;
    if (event) {
      const { data: sessData } = await admin
        .from('event_sessions')
        .select('*')
        .eq('event_id', event.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      session = sessData;
    }

    return NextResponse.json({
      success: true,
      event: event || null,
      session: session || null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      eventId,
      eventName,
      eventDate,
      timezone,
      kioskEnabled,
      offlineAllowed,
      photoRetentionDays,
      sessionId,
      sessionName,
      sessionStatus,
    } = body;

    const admin = createAdminClient();

    // 1. Update or Insert Event
    if (eventId) {
      await admin
        .from('events')
        .update({
          name: eventName,
          event_date: eventDate,
          timezone,
          kiosk_enabled: kioskEnabled,
          offline_allowed: offlineAllowed,
          photo_retention_days: photoRetentionDays,
          updated_at: new Date().toISOString(),
        })
        .eq('id', eventId);
    }

    // 2. Update Session
    if (sessionId) {
      await admin
        .from('event_sessions')
        .update({
          name: sessionName,
          status: sessionStatus,
          closes_at: sessionStatus === 'closed' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId);
    }

    await recordAuditLog({
      action: 'EVENT_SETTINGS_UPDATED',
      entityType: 'EVENT',
      entityId: eventId,
      outcome: 'success',
      metadata: { eventName, sessionStatus, kioskEnabled },
    });

    return NextResponse.json({ success: true, message: 'Settings updated successfully.' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
