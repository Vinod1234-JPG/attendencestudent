import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeEmail, normalizePhdId, maskIdentifier, isNameMatching } from '@/lib/utils/normalization';
import { getDevStorage } from '@/lib/db/devStore';

export async function POST(request: Request) {
  try {
    const { category, identifier, name } = await request.json();

    if (!category || !identifier) {
      return NextResponse.json(
        { error: 'Category and identifier are required.' },
        { status: 400 }
      );
    }

    if (!name || !String(name).trim()) {
      return NextResponse.json(
        { error: 'Full Name is required.' },
        { status: 400 }
      );
    }

    if (category !== 'guide' && category !== 'phd_scholar') {
      return NextResponse.json(
        { error: 'Invalid attendee category specified.' },
        { status: 400 }
      );
    }

    const trimmedName = String(name).trim();
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

      // If matched, verify both name and identifier
      if (matchedPerson && !isNameMatching(trimmedName, matchedPerson.name)) {
        return NextResponse.json(
          {
            error:
              category === 'guide'
                ? `The entered name "${trimmedName}" does not match the registered name for this email address.`
                : `The entered name "${trimmedName}" does not match the registered name for PhD ID ${identifier}.`,
          },
          { status: 400 }
        );
      }

      // If not in dev database, create on the fly so attendee can proceed in test mode
      if (!matchedPerson) {
        matchedPerson = {
          id: crypto.randomUUID(),
          name: trimmedName,
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
          name: 'MRF Research Retreat',
        },
        session: {
          id: 'dev-session-1',
          name: 'General Retreat Check-in Session',
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

    // 2. Lookup attendee in `people` by identifier
    let person = null;

    if (category === 'guide') {
      const { data, error } = await admin
        .from('people')
        .select('id, name, category, normalized_email, metadata')
        .eq('category', 'guide')
        .ilike('normalized_email', normalized)
        .maybeSingle();

      if (data) {
        person = data;
      } else {
        // Also check if Guide email was in metadata
        const { data: allGuides } = await admin
          .from('people')
          .select('id, name, category, normalized_email, metadata')
          .eq('category', 'guide');

        const clean = identifier.trim().toLowerCase();
        person = (allGuides || []).find((g) => {
          if (g.normalized_email && g.normalized_email.toLowerCase() === clean) return true;
          if (g.metadata) {
            const mEmail = g.metadata.Email || g.metadata.email || g.metadata['Email ID'] || g.metadata['Email Address'];
            if (mEmail && String(mEmail).trim().toLowerCase() === clean) return true;
          }
          return false;
        });

        if (!person) {
          // Check if user is registered under PhD Scholar instead
          const { data: altScholar } = await admin
            .from('people')
            .select('name')
            .eq('category', 'phd_scholar')
            .or(`phd_id.ilike.%${identifier.trim()}%,normalized_email.ilike.%${identifier.trim()}%`)
            .limit(1)
            .maybeSingle();

          if (altScholar) {
            return NextResponse.json(
              {
                error: `Found "${altScholar.name}" under PhD Scholar. Please select the "PhD Scholar" category button above.`,
              },
              { status: 400 }
            );
          }

          return NextResponse.json(
            {
              error:
                'Guide email not found on MRF website. Please verify your registered email address or contact the registration desk.',
            },
            { status: 404 }
          );
        }
      }
    } else {
      // PhD Scholar: lookup by PhD ID (case-insensitive) or email
      const rawTrimmed = identifier.trim();
      const cleanLower = rawTrimmed.toLowerCase();

      // 1. Try exact / case-insensitive match on phd_id
      const { data: byPhdId } = await admin
        .from('people')
        .select('id, name, category, phd_id, normalized_email, metadata')
        .eq('category', 'phd_scholar')
        .ilike('phd_id', rawTrimmed)
        .maybeSingle();

      if (byPhdId) {
        person = byPhdId;
      } else {
        // 2. Try case-insensitive match on normalized_email
        const { data: byEmail } = await admin
          .from('people')
          .select('id, name, category, phd_id, normalized_email, metadata')
          .eq('category', 'phd_scholar')
          .ilike('normalized_email', cleanLower)
          .maybeSingle();

        if (byEmail) {
          person = byEmail;
        } else {
          // 3. Check metadata for Email, USN, Roll No, or PhD ID (case-insensitive)
          const { data: allScholars } = await admin
            .from('people')
            .select('id, name, category, phd_id, normalized_email, metadata')
            .eq('category', 'phd_scholar');

          person = (allScholars || []).find((s) => {
            if (s.phd_id && s.phd_id.trim().toLowerCase() === cleanLower) return true;
            if (s.normalized_email && s.normalized_email.trim().toLowerCase() === cleanLower) return true;
            if (s.metadata) {
              const mEmail = s.metadata.Email || s.metadata.email || s.metadata['Email ID'] || s.metadata['Email Address'];
              if (mEmail && String(mEmail).trim().toLowerCase() === cleanLower) return true;
              const mId = s.metadata.USN || s.metadata.usn || s.metadata['PhD ID'] || s.metadata['Ph.D ID'] || s.metadata.ID || s.metadata['Roll No'];
              if (mId && String(mId).trim().toLowerCase() === cleanLower) return true;
            }
            return false;
          });
        }
      }

      if (!person) {
        // Check if user is registered under Guide instead
        const { data: altGuide } = await admin
          .from('people')
          .select('name')
          .eq('category', 'guide')
          .ilike('normalized_email', identifier.trim().toLowerCase())
          .maybeSingle();

        if (altGuide) {
          return NextResponse.json(
            {
              error: `Found "${altGuide.name}" under Research Guide. Please select the "Guide" category button above.`,
            },
            { status: 400 }
          );
        }

        return NextResponse.json(
          {
            error:
              'Official PhD ID or email not found on MRF website. Please check your registered MRF details or contact the registration desk.',
          },
          { status: 404 }
        );
      }
    }

    // 3. Strict Check: Verify that the entered name matches the registered person's name
    if (!isNameMatching(trimmedName, person.name)) {
      return NextResponse.json(
        {
          error:
            category === 'guide'
              ? `The entered name "${trimmedName}" does not match the registered name on the MRF website for this email address (${person.name}).`
              : `The entered name "${trimmedName}" does not match the registered name on the MRF website for PhD ID ${identifier} (${person.name}).`,
        },
        { status: 400 }
      );
    }

    // 4. Check for existing attendance in this session (duplicate prevention)
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
