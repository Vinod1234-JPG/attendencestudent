import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Event / Room: the event or room a teacher takes attendance for (set by the admin on the Teachers page and
 * stored on the teacher's login as user_metadata.event_room).
 *
 * Each new registration keeps a copy in the student's metadata (EVENT_ROOM_KEY), so moving a teacher to another
 * event later does not move the students they already registered.
 */
export const EVENT_ROOM_KEY = 'Event / Room';

/** Label for registrations made without a teacher's event / room (admin or kiosk with nobody signed in). */
export const GENERAL_EVENT_ROOM = 'General';

const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/** The event / room of one staff member, or '' if none is set. */
export async function getEventRoomFor(admin: SupabaseClient, userId: string | null | undefined): Promise<string> {
  if (!userId) return '';
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    return clean(data?.user?.user_metadata?.event_room);
  } catch {
    return '';
  }
}

/** Every staff member's event / room, by user id. One request for the whole list. */
export async function getStaffEventRooms(admin: SupabaseClient): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users || []) {
      const room = clean((u as any).user_metadata?.event_room);
      if (room) map.set(u.id, room);
    }
  } catch {
    // no event / room names: everything shows as General
  }
  return map;
}

/**
 * The event / room of a registration: the copy saved on the student when they registered, otherwise (older
 * registrations) the registering teacher's current event / room, otherwise General.
 */
export function resolveEventRoom(
  metadata: Record<string, unknown> | null | undefined,
  registeredBy: string | null | undefined,
  rooms: Map<string, string>
): string {
  return clean(metadata?.[EVENT_ROOM_KEY]) || (registeredBy ? rooms.get(registeredBy) || '' : '') || GENERAL_EVENT_ROOM;
}
