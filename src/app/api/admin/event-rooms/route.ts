import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { requireStaff } from '@/lib/auth/requireAdmin';
import { isTeacher } from '@/lib/auth/staffScope';
import { isPlaceholderMode } from '@/lib/auth/adminSession';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDevStorage } from '@/lib/db/devStore';
import { GENERAL_EVENT_ROOM, getEventRoomFor, getStaffEventRooms, resolveEventRoom } from '@/lib/staff/eventRoom';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Students checked in per Event / Room. Teachers get only their own registrations; `mine` is the signed-in
 * staff member's own assigned event / room.
 */
export async function GET() {
  const auth = await requireStaff();
  if (auth.response) return auth.response;
  noStore();

  try {
    if (isPlaceholderMode()) {
      const total = getDevStorage().attendanceRecords.length;
      return NextResponse.json(
        { success: true, mine: '', rooms: total ? [{ name: GENERAL_EVENT_ROOM, students: total }] : [] },
        { headers: NO_STORE }
      );
    }

    const admin = createAdminClient();
    const teacherId = isTeacher(auth.admin) ? (auth.admin.id as string) : null;

    let query = admin.from('attendance_records').select('person_id, registered_by, people ( metadata )').limit(100000);
    if (teacherId) query = query.eq('registered_by', teacherId);

    const [{ data, error }, rooms, mine] = await Promise.all([
      query,
      getStaffEventRooms(admin),
      getEventRoomFor(admin, auth.admin.id as string),
    ]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });

    const counts = new Map<string, number>();
    for (const r of (data || []) as any[]) {
      const person = Array.isArray(r.people) ? r.people[0] : r.people;
      const name = resolveEventRoom(person?.metadata, r.registered_by, rooms);
      counts.set(name, (counts.get(name) || 0) + 1);
    }

    const list = Array.from(counts.entries())
      .map(([name, students]) => ({ name, students }))
      .sort((a, b) => b.students - a.students || a.name.localeCompare(b.name));

    return NextResponse.json({ success: true, mine, rooms: list }, { headers: NO_STORE });
  } catch (err: any) {
    console.error('Event / room summary error:', err);
    return NextResponse.json({ error: 'Could not load the events / rooms.' }, { status: 500, headers: NO_STORE });
  }
}
