import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDevStorage } from '@/lib/db/devStore';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET() {
  noStore();
  try {
    const isPlaceholder =
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');

    if (isPlaceholder) {
      const devStore = getDevStorage();
      const attendees = devStore.people.map((p) => {
        const att = devStore.attendanceRecords.find((r) => r.attendee.id === p.id);
        const email =
          p.normalized_email ||
          p.metadata?.Email ||
          p.metadata?.email ||
          p.metadata?.['Email ID'] ||
          null;
        const phdId =
          p.phd_id ||
          p.metadata?.['PhD ID'] ||
          p.metadata?.['Ph.D ID'] ||
          p.metadata?.USN ||
          null;

        return {
          id: p.id,
          name: p.name,
          category: p.category,
          email,
          phd_id: phdId,
          metadata: p.metadata || {},
          attended: !!att,
        };
      });

      return NextResponse.json(
        { success: true, attendees },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      );
    }

    const admin = createAdminClient();

    // 1. Fetch all registered people
    const { data: peopleRaw, error: peopleErr } = await admin
      .from('people')
      .select('id, name, category, normalized_email, phd_id, metadata')
      .order('name', { ascending: true });

    if (peopleErr) {
      console.error('Fetch kiosk attendees error:', peopleErr);
      return NextResponse.json({ error: peopleErr.message }, { status: 500 });
    }

    // 2. Fetch all confirmed attendance records to mark who already checked in
    const { data: attendanceRaw } = await admin
      .from('attendance_records')
      .select('person_id, status');

    const attendedPersonIds = new Set<string>();
    (attendanceRaw || []).forEach((r) => {
      if (r.person_id) attendedPersonIds.add(r.person_id);
    });

    const attendees = (peopleRaw || []).map((p: any) => {
      const email =
        p.normalized_email ||
        p.metadata?.Email ||
        p.metadata?.email ||
        p.metadata?.['Email ID'] ||
        p.metadata?.['Email Address'] ||
        null;
      const phdId =
        p.phd_id ||
        p.metadata?.['PhD ID'] ||
        p.metadata?.['Ph.D ID'] ||
        p.metadata?.USN ||
        p.metadata?.usn ||
        p.metadata?.ID ||
        null;

      return {
        id: p.id,
        name: p.name,
        category: p.category,
        email,
        phd_id: phdId,
        metadata: p.metadata || {},
        attended: attendedPersonIds.has(p.id),
      };
    });

    return NextResponse.json(
      { success: true, attendees },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (err: any) {
    console.error('Kiosk attendees list error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch attendees list.' },
      { status: 500 }
    );
  }
}
