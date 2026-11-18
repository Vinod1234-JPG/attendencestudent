import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/utils/audit';
import { clearDevData, getDevStorage, replaceDevData } from '@/lib/db/devStore';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { isPlaceholderMode } from '@/lib/auth/adminSession';
import { emitReset } from '@/lib/live-bus';
import { CONFIG_HELP, SupabaseConfigError } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const BUCKET = 'mrf-attendance-photos';
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export interface StudentRow {
  id: string;
  name: string;
  college: string;
  registeredAt: string | null;
  checkIns: number;
  photos: number;
}

const MAX_LIST = 5000;
const CHUNK = 100; // ids per ".in()" filter, keeps the request URL short

function chunks<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

/** Every student, newest first, with how many check-ins and photos each one has. */
async function listStudents(): Promise<StudentRow[]> {
  if (isPlaceholderMode()) {
    const dev = getDevStorage();
    return dev.people
      .map((p) => {
        const recs = dev.attendanceRecords.filter((r) => r.attendee.id === p.id);
        return {
          id: p.id,
          name: p.name,
          college: p.college || '',
          registeredAt: p.created_at || null,
          checkIns: recs.length,
          photos: recs.filter((r) => r.photo?.available).length,
        };
      })
      .sort((a, b) => String(b.registeredAt).localeCompare(String(a.registeredAt)));
  }

  const admin = createAdminClient();
  const [peopleRes, recordsRes, photosRes] = await Promise.all([
    admin.from('people').select('id, name, college, created_at').order('created_at', { ascending: false }).limit(MAX_LIST),
    admin.from('attendance_records').select('id, person_id').limit(100000),
    admin.from('attendance_photos').select('attendance_record_id').limit(100000),
  ]);
  if (peopleRes.error) throw new Error(peopleRes.error.message);

  const recordOwner = new Map<string, string>();
  const checkIns = new Map<string, number>();
  for (const r of (recordsRes.data || []) as any[]) {
    recordOwner.set(r.id, r.person_id);
    checkIns.set(r.person_id, (checkIns.get(r.person_id) || 0) + 1);
  }
  const photos = new Map<string, number>();
  for (const ph of (photosRes.data || []) as any[]) {
    const owner = recordOwner.get(ph.attendance_record_id);
    if (owner) photos.set(owner, (photos.get(owner) || 0) + 1);
  }

  return (peopleRes.data || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    college: p.college || '',
    registeredAt: p.created_at || null,
    checkIns: checkIns.get(p.id) || 0,
    photos: photos.get(p.id) || 0,
  }));
}

/** Counts of everything "Remove all data" would delete (and, with ?list=1, the students themselves). */
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  noStore();
  try {
    if (new URL(request.url).searchParams.get('list') === '1') {
      const students = await listStudents();
      return NextResponse.json({ success: true, students, truncated: students.length >= MAX_LIST });
    }

    if (isPlaceholderMode()) {
      const dev = getDevStorage();
      return NextResponse.json({
        success: true,
        counts: {
          people: dev.people.length,
          attendance: dev.attendanceRecords.length,
          photos: dev.attendanceRecords.filter((r) => r.photo?.available).length,
        },
      });
    }

    const admin = createAdminClient();
    const [people, attendance, photos] = await Promise.all([
      admin.from('people').select('*', { count: 'exact', head: true }),
      admin.from('attendance_records').select('*', { count: 'exact', head: true }),
      admin.from('attendance_photos').select('*', { count: 'exact', head: true }),
    ]);

    return NextResponse.json({
      success: true,
      counts: {
        people: people.count || 0,
        attendance: attendance.count || 0,
        photos: photos.count || 0,
      },
    });
  } catch (err: any) {
    if (err instanceof SupabaseConfigError) {
      return NextResponse.json({ error: CONFIG_HELP }, { status: 503 });
    }
    return NextResponse.json({ error: err.message || 'Failed to fetch counts' }, { status: 500 });
  }
}

/** Removes every file under the photos folder, including nested session folders. */
async function removeAllPhotoObjects(admin: ReturnType<typeof createAdminClient>, knownKeys: string[]) {
  const storage = admin.storage.from(BUCKET);
  let removed = 0;

  // 1. The exact keys recorded in the database
  for (let i = 0; i < knownKeys.length; i += 100) {
    const chunk = knownKeys.slice(i, i + 100);
    const { data, error } = await storage.remove(chunk);
    if (!error) removed += data?.length ?? chunk.length;
  }

  // 2. Sweep anything left over (orphaned uploads): photos/<session>/<file>
  const { data: sessions } = await storage.list('photos', { limit: 1000 });
  for (const entry of sessions || []) {
    const folder = `photos/${entry.name}`;
    // a file directly under photos/ has metadata; a folder does not
    if ((entry as any).metadata) {
      const { data } = await storage.remove([folder]);
      removed += data?.length ?? 0;
      continue;
    }
    for (;;) {
      const { data: files } = await storage.list(folder, { limit: 100 });
      if (!files || files.length === 0) break;
      const { data, error } = await storage.remove(files.map((f) => `${folder}/${f.name}`));
      if (error) break;
      removed += data?.length ?? files.length;
      if (files.length < 100) break;
    }
  }
  return removed;
}

/**
 * Removes only the chosen students, together with their attendance records and photos (database rows and
 * the photo files in storage).
 */
async function deleteSelected(rawIds: unknown) {
  const ids = Array.from(
    new Set(
      (Array.isArray(rawIds) ? rawIds : []).filter(
        (x): x is string => typeof x === 'string' && x.length > 0 && x.length < 100
      )
    )
  );
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Select at least one student to delete.' }, { status: 400 });
  }

  if (isPlaceholderMode()) {
    const store = getDevStorage();
    const chosen = new Set(ids);
    const recs = store.attendanceRecords.filter((r) => chosen.has(r.attendee.id));
    const people = store.people.filter((p) => chosen.has(p.id)).length;
    replaceDevData({
      people: store.people.filter((p) => !chosen.has(p.id)),
      attendanceRecords: store.attendanceRecords.filter((r) => !chosen.has(r.attendee.id)),
    });
    emitReset();
    return NextResponse.json({
      success: true,
      deleted: { people, attendance_records: recs.length, photo_files: recs.filter((r) => r.photo?.available).length },
    });
  }

  const admin = createAdminClient();

  // Find their attendance records and photo files first.
  const recordIds: string[] = [];
  for (const part of chunks(ids)) {
    const { data, error } = await admin.from('attendance_records').select('id').in('person_id', part);
    if (error) return NextResponse.json({ error: `Could not read attendance records: ${error.message}` }, { status: 500 });
    for (const r of (data || []) as any[]) recordIds.push(r.id);
  }
  const photoKeys: string[] = [];
  for (const part of chunks(recordIds)) {
    const { data } = await admin.from('attendance_photos').select('storage_object_key').in('attendance_record_id', part);
    for (const ph of (data || []) as any[]) if (ph.storage_object_key) photoKeys.push(ph.storage_object_key);
  }

  const fail = async (label: string, message: string) => {
    await recordAuditLog({
      action: 'STUDENTS_DELETED',
      entityType: 'PERSON',
      outcome: 'failure',
      metadata: { failed_step: label, error: message, requested: ids.length },
    });
    return NextResponse.json({ error: `Could not remove ${label}: ${message}` }, { status: 500 });
  };

  // Children first (foreign keys), then the students.
  for (const part of chunks(recordIds)) {
    const { error } = await admin.from('attendance_photos').delete().in('attendance_record_id', part);
    if (error) return fail('photo records', error.message);
  }
  for (const part of chunks(recordIds)) {
    const { error } = await admin.from('attendance_records').delete().in('id', part);
    if (error) return fail('attendance records', error.message);
  }
  let people = 0;
  for (const part of chunks(ids)) {
    const { data, error } = await admin.from('people').delete().in('id', part).select('id');
    if (error) return fail('students', error.message);
    people += data?.length ?? 0;
  }

  let photoFiles = 0;
  for (const part of chunks(photoKeys)) {
    const { data, error } = await admin.storage.from(BUCKET).remove(part);
    if (!error) photoFiles += data?.length ?? part.length;
  }

  await recordAuditLog({
    action: 'STUDENTS_DELETED',
    entityType: 'PERSON',
    outcome: 'success',
    metadata: { deleted_people: people, deleted_attendance: recordIds.length, deleted_photo_files: photoFiles },
  });

  emitReset(); // the Live Display reloads, in case it was showing one of these students

  return NextResponse.json({
    success: true,
    deleted: { people, attendance_records: recordIds.length, attendance_photos: photoKeys.length, photo_files: photoFiles },
  });
}

/**
 * Removes ALL students, attendance records and photos. Keeps the event, session, admin accounts and the
 * audit log (which records this action).
 */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  noStore();
  try {
    const body = await request.json().catch(() => ({}));
    if (body && body.confirm === 'DELETE_SELECTED') {
      return await deleteSelected(body.ids);
    }
    if (!body || body.confirm !== 'PURGE_ALL_DATA') {
      return NextResponse.json(
        { error: 'Confirmation required. Pass { "confirm": "PURGE_ALL_DATA" } to proceed.' },
        { status: 400 }
      );
    }

    if (isPlaceholderMode()) {
      const removed = clearDevData();
      emitReset();
      return NextResponse.json({
        success: true,
        message: 'All students, attendance records and photos were removed.',
        deleted: { people: removed.people, attendance_records: removed.attendance, attendance_photos: removed.attendance },
      });
    }

    const admin = createAdminClient();

    const [people, attendance, photos, keysRes] = await Promise.all([
      admin.from('people').select('*', { count: 'exact', head: true }),
      admin.from('attendance_records').select('*', { count: 'exact', head: true }),
      admin.from('attendance_photos').select('*', { count: 'exact', head: true }),
      admin.from('attendance_photos').select('storage_object_key').limit(100000),
    ]);
    const photoKeys = (keysRes.data || []).map((r: any) => r.storage_object_key).filter(Boolean);

    // Order matters: children first (foreign keys). Stop at the first failure.
    const steps: [string, string][] = [
      ['attendance_photos', 'photo records'],
      ['attendance_records', 'attendance records'],
      ['sync_conflicts', 'sync conflicts'],
      ['people', 'students'],
      ['import_errors', 'import errors'],
      ['import_batches', 'import batches'],
    ];
    for (const [table, label] of steps) {
      const { error } = await admin.from(table).delete().neq('id', NIL_UUID);
      // A table that was never created in this project has nothing to delete: skip it.
      const missingTable =
        error && (error.code === 'PGRST205' || error.code === '42P01' || /could not find the table|does not exist/i.test(error.message));
      if (error && !missingTable) {
        console.error(`Reset data: failed to delete ${table}:`, error.message);
        await recordAuditLog({
          action: 'SYSTEM_DATA_PURGE',
          entityType: 'system',
          outcome: 'failure',
          metadata: { failed_step: table, error: error.message },
        });
        return NextResponse.json(
          { error: `Could not remove ${label}: ${error.message}. Nothing after this step was deleted.` },
          { status: 500 }
        );
      }
    }

    let photosRemoved = 0;
    try {
      photosRemoved = await removeAllPhotoObjects(admin, photoKeys);
    } catch (storageErr) {
      console.warn('Reset data: photo storage cleanup warning (non-fatal):', storageErr);
    }

    await recordAuditLog({
      action: 'SYSTEM_DATA_PURGE',
      entityType: 'system',
      outcome: 'success',
      metadata: {
        purged_people: people.count || 0,
        purged_attendance: attendance.count || 0,
        purged_photo_records: photos.count || 0,
        purged_photo_files: photosRemoved,
      },
    });

    emitReset();

    return NextResponse.json({
      success: true,
      message: 'All students, attendance records and photos were removed.',
      deleted: {
        people: people.count || 0,
        attendance_records: attendance.count || 0,
        attendance_photos: photos.count || 0,
        photo_files: photosRemoved,
      },
    });
  } catch (err: any) {
    if (err instanceof SupabaseConfigError) {
      return NextResponse.json({ error: CONFIG_HELP }, { status: 503 });
    }
    console.error('Reset data error:', err);
    return NextResponse.json({ error: err.message || 'Failed to remove data.' }, { status: 500 });
  }
}
