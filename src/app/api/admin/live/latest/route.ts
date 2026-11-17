import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { isPlaceholderMode } from '@/lib/auth/adminSession';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDevStorage } from '@/lib/db/devStore';
import { CONFIG_HELP, SupabaseConfigError } from '@/lib/supabase/config';
import type { LiveRegistration } from '@/lib/live-bus';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

/** The newest student registration (that has a photo) for the active event, or null. */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  try {
    if (isPlaceholderMode()) {
      const newest = getDevStorage()
        .attendanceRecords.filter((r) => r.attendee.category === 'student' && r.photo?.signed_url)
        .sort(
          (a, b) =>
            new Date(b.captured_at_device).getTime() - new Date(a.captured_at_device).getTime() ||
            new Date(b.received_at_server).getTime() - new Date(a.received_at_server).getTime()
        )[0];

      const registration: LiveRegistration | null = newest
        ? {
            attendeeId: newest.attendee.id,
            name: newest.attendee.name,
            college: newest.attendee.identifier || String(newest.attendee.extra_details?.College || ''),
            photoUrl: newest.photo.signed_url,
            capturedAt: newest.captured_at_device,
          }
        : null;
      return NextResponse.json({ success: true, registration }, { headers: NO_STORE });
    }

    const admin = createAdminClient();

    // Sessions of the active event
    const { data: event } = await admin.from('events').select('id').eq('status', 'active').maybeSingle();
    if (!event) return NextResponse.json({ success: true, registration: null }, { headers: NO_STORE });

    const { data: sessions } = await admin.from('event_sessions').select('id').eq('event_id', event.id);
    const sessionIds = (sessions || []).map((s: any) => s.id);
    if (sessionIds.length === 0) {
      return NextResponse.json({ success: true, registration: null }, { headers: NO_STORE });
    }

    const { data, error } = await admin
      .from('attendance_records')
      .select(
        `
        person_id,
        captured_at_device,
        received_at_server,
        people!inner ( id, name, college, category ),
        attendance_photos!inner ( storage_object_key )
      `
      )
      .in('session_id', sessionIds)
      .eq('people.category', 'student')
      .order('captured_at_device', { ascending: false })
      .order('received_at_server', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Live latest query failed:', error.message);
      return NextResponse.json({ error: CONFIG_HELP }, { status: 503, headers: NO_STORE });
    }

    const row: any = (data || [])[0];
    if (!row) return NextResponse.json({ success: true, registration: null }, { headers: NO_STORE });

    const person = Array.isArray(row.people) ? row.people[0] : row.people;
    const photo = Array.isArray(row.attendance_photos) ? row.attendance_photos[0] : row.attendance_photos;

    const registration: LiveRegistration = {
      attendeeId: person.id,
      name: person.name,
      college: person.college || '',
      photoUrl: `/api/attendance/photo?key=${encodeURIComponent(photo.storage_object_key)}`,
      capturedAt: row.captured_at_device,
    };
    return NextResponse.json({ success: true, registration }, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof SupabaseConfigError) {
      return NextResponse.json({ error: CONFIG_HELP }, { status: 503, headers: NO_STORE });
    }
    console.error('Live latest error:', err);
    return NextResponse.json({ error: 'Could not load the latest registration.' }, { status: 500, headers: NO_STORE });
  }
}
