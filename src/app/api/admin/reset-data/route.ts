import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/utils/audit';
import { clearDevData, getDevStorage } from '@/lib/db/devStore';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { isPlaceholderMode } from '@/lib/auth/adminSession';
import { emitReset } from '@/lib/live-bus';
import { CONFIG_HELP, SupabaseConfigError } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const BUCKET = 'mrf-attendance-photos';
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/** Counts of everything "Remove all data" would delete. */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  noStore();
  try {
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
 * Removes ALL students, attendance records and photos. Keeps the event, session, admin accounts and the
 * audit log (which records this action).
 */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  noStore();
  try {
    const body = await request.json().catch(() => ({}));
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
