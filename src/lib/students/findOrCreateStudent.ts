import type { SupabaseClient } from '@supabase/supabase-js';
import { addDevPeople, getDevStorage, DevPerson } from '@/lib/db/devStore';
import { buildStudentKey, cleanDisplayText } from '@/lib/utils/normalization';
import { EVENT_ROOM_KEY } from '@/lib/staff/eventRoom';

export interface StudentRecord {
  id: string;
  name: string;
  college: string;
  category: 'student';
  created: boolean;
}

const STUDENT_COLUMNS = 'id, name, college, category';

/** Looks up a student by name + college without creating anything. */
export async function findStudent(
  admin: SupabaseClient,
  name: string,
  college: string
): Promise<StudentRecord | null> {
  const { data } = await admin
    .from('people')
    .select(STUDENT_COLUMNS)
    .eq('category', 'student')
    .eq('student_key', buildStudentKey(name, college))
    .maybeSingle();

  return data ? { ...(data as any), category: 'student', created: false } : null;
}

/**
 * Returns the student's existing record, registering them on first check-in.
 * Safe under concurrent kiosks: a unique index on student_key resolves races.
 */
export async function findOrCreateStudent(
  admin: SupabaseClient,
  rawName: string,
  rawCollege: string,
  registeredBy: string | null = null,
  eventRoom = ''
): Promise<StudentRecord> {
  const name = cleanDisplayText(rawName);
  const college = cleanDisplayText(rawCollege);
  const studentKey = buildStudentKey(name, college);

  const existing = await findStudent(admin, name, college);
  if (existing) return existing;

  const fields = {
    category: 'student',
    name,
    college,
    student_key: studentKey,
    normalized_email: null,
    phd_id: null,
    metadata: {
      College: college,
      Status: 'Self-Registered at Kiosk',
      ...(eventRoom ? { [EVENT_ROOM_KEY]: eventRoom } : {}),
    },
  };
  const insertStudent = (extra: Record<string, unknown>) =>
    admin.from('people').insert({ ...fields, ...extra }).select(STUDENT_COLUMNS).single();

  // registered_by is only written when someone was signed in, and skipped if the teachers migration is missing
  let { data: inserted, error } = await insertStudent(registeredBy ? { registered_by: registeredBy } : {});
  if (error?.code === '42703' && registeredBy) {
    ({ data: inserted, error } = await insertStudent({}));
  }

  if (inserted) return { ...(inserted as any), category: 'student', created: true };

  // Another kiosk registered the same student a moment earlier.
  if (error?.code === '23505') {
    const raced = await findStudent(admin, name, college);
    if (raced) return raced;
  }

  throw new Error(error?.message || 'Could not register student.');
}

/** Development (no Supabase) equivalent backed by the local JSON store. */
export function findOrCreateDevStudent(
  rawName: string,
  rawCollege: string,
  options: { create: boolean } = { create: true }
): (DevPerson & { created: boolean }) | null {
  const name = cleanDisplayText(rawName);
  const college = cleanDisplayText(rawCollege);
  const studentKey = buildStudentKey(name, college);

  const existing = getDevStorage().people.find(
    (p) => p.category === 'student' && p.student_key === studentKey
  );
  if (existing) return { ...existing, created: false };
  if (!options.create) return null;

  const person: DevPerson = {
    id: crypto.randomUUID(),
    name,
    category: 'student',
    college,
    student_key: studentKey,
    created_at: new Date().toISOString(),
    normalized_email: null,
    phd_id: null,
    metadata: { College: college, Status: 'Self-Registered at Kiosk' },
  };
  addDevPeople([person]);
  return { ...person, created: true };
}
