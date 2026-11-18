import { isAdminRole } from './adminSession';

/** Minimal shape of a signed-in dashboard user. */
export interface StaffLike {
  id: string | null;
  role: string;
}

/** A teacher only ever works with the records they created. Admins see everything. */
export function isTeacher(staff: StaffLike | null | undefined): boolean {
  return !!staff && staff.role === 'teacher';
}

/**
 * Who may see a registration on a Live Display.
 *  - teachers: only registrations they made
 *  - admins: their own and anonymous ones (nobody signed in at the kiosk); `scope=all` shows everything
 */
export function canSeeRegistration(
  staff: StaffLike,
  ownerId: string | null | undefined,
  scope: 'own' | 'all' = 'own'
): boolean {
  if (staff.role === 'teacher') return !!staff.id && ownerId === staff.id;
  if (isAdminRole(staff.role)) {
    if (scope === 'all') return true;
    return ownerId == null || ownerId === staff.id;
  }
  return false;
}
