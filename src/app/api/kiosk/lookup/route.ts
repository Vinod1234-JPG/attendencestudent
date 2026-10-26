import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeEmail, normalizePhdId, maskIdentifier } from '@/lib/utils/normalization';
import { getDevStorage } from '@/lib/db/devStore';

export async function POST(request: Request) {
  try {
    const { category, identifier } = await request.json();

    if (!category || !identifier) {
      return NextResponse.json(
        { error: 'Category and identifier are required.' },
        { status: 400 }
      );
    }

    if (category !== 'guide' && category !== 'phd_scholar') {
      return NextResponse.json(
        { error: 'Invalid attendee category specified.' },
        { status: 400 }
      );
    }

    const isPlaceholder =
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');

    const normalized = category === 'guide' ? normalizeEmail(identifier) : normalizePhdId(identifier);

    // Development Fallback when live Supabase is not connected yet
    if (isPlaceholder) {
      const devStore = getDevStorage();
      let matchedPerson = devStore.people.find((p) => {
        if (category === 'guide') {
          return p.category === 'guide' && p.normalized_email === normalized;
        } else {
          return p.category === 'phd_scholar' && p.phd_id === normalized;
        }
      });

      // If not in dev database, create on the fly so attendee can proceed in test mode
      if (!matchedPerson) {
        matchedPerson = {
          id: crypto.randomUUID(),
          name: category === 'guide' ? `Guide (${normalized.split('@')[0]})` : `PhD Scholar (${normalized})`,
          category,
          normalized_email: category === 'guide' ? normalized : null,
          phd_id: category === 'phd_scholar' ? normalized : null,
          metadata: {
            Status: 'Self-Registered at Kiosk',
            Category: category === 'guide' ? 'Guide' : 'PhD Scholar',
          },
        };
      }

      // Check if already attended in dev store
      const alreadyAttended = devStore.attendanceRecords.some(
        (r) => r.attendee.id === matchedPerson!.id || r.attendee.identifier === normalized
      );

      const masked = maskIdentifier(normalized, category);

      return NextResponse.json({
        success: true,
        person: {
          id: matchedPerson.id,
          name: matchedPerson.name,
          category: matchedPerson.category,
          masked_identifier: masked,
          identifier: normalized,
          extra_details: matchedPerson.metadata || {},
        },
        event: {
          id: 'dev-event-1',
          name: 'MRF Annual Research Conclave 2026',
        },
        session: {
          id: 'dev-session-1',
          name: 'General Conclave Check-in Session',
        },
        already_attended: alreadyAttended,
        existing_record: null,
      });
    }

    const admin = createAdminClient();

    // 1. Fetch active event & session
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
      .select('id, name, status, opens_at, closes_at')
      .eq('event_id', event.id)
      .eq('status', 'open')
      .maybeSingle();

    if (sessErr || !session) {
      return NextResponse.json(
        { error: 'The attendance session is currently closed.' },
        { status: 400 }
      );
    }

    // 2. Lookup attendee in `people`
    let person = null;

    if (category === 'guide') {
      const { data, error } = await admin
        .from('people')
        .select('id, name, category, normalized_email, metadata')
        .eq('category', 'guide')
        .ilike('normalized_email', normalized)
        .maybeSingle();

      if (error || !data) {
        return NextResponse.json(
          {
            error:
              'Guide email not found. Please verify your registered email address or contact the registration desk.',
          },
          { status: 404 }
        );
      }
      person = data;
    } else {
      // PhD Scholar: allow lookup by PhD ID (case-insensitive) or email
      let scholarQuery = admin
        .from('people')
        .select('id, name, category, phd_id, normalized_email, metadata')
        .eq('category', 'phd_scholar');

      // Try exact / case-insensitive match on phd_id
      const { data: byPhdId } = await scholarQuery
        .ilike('phd_id', normalized)
        .maybeSingle();

      if (byPhdId) {
        person = byPhdId;
      } else {
        // Also check if entered without leading zeros or with email
        const { data: byAlt } = await admin
          .from('people')
          .select('id, name, category, phd_id, normalized_email, metadata')
          .eq('category', 'phd_scholar')
          .or(`phd_id.ilike.%${identifier.trim()}%,normalized_email.ilike.%${identifier.trim()}%`)
          .limit(1)
          .maybeSingle();

        if (byAlt) {
          person = byAlt;
        }
      }

      if (!person) {
        return NextResponse.json(
          {
            error:
              'Official PhD ID or email not found. Please check your MRF PhD ID or contact the registration desk.',
          },
          { status: 404 }
        );
      }
    }

    // 3. Check for existing attendance in this session (duplicate prevention)
    const { data: existingRecord } = await admin
      .from('attendance_records')
      .select('id, captured_at_device')
      .eq('session_id', session.id)
      .eq('person_id', person.id)
      .maybeSingle();

    const masked = maskIdentifier(normalized, category);

    return NextResponse.json({
      success: true,
      person: {
        id: person.id,
        name: person.name,
        category: person.category,
        masked_identifier: masked,
        identifier: normalized,
      },
      event: {
        id: event.id,
        name: event.name,
      },
      session: {
        id: session.id,
        name: session.name,
      },
      already_attended: !!existingRecord,
      existing_record: existingRecord || null,
    });
  } catch (err: any) {
    console.error('Kiosk lookup exception:', err);
    return NextResponse.json(
      { error: 'Server error processing attendee lookup.' },
      { status: 500 }
    );
  }
}
