import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/utils/audit';
import { getDevStorage } from '@/lib/db/devStore';

export async function GET() {
  try {
    const isPlaceholder =
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder') ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-id');

    if (isPlaceholder) {
      const devStore = getDevStorage();
      return NextResponse.json({
        success: true,
        counts: {
          people: devStore.people.length,
          attendance: devStore.attendanceRecords.length,
          batches: 0,
        },
      });
    }

    const admin = createAdminClient();

    const [
      { count: peopleCount },
      { count: attendanceCount },
      { count: photosCount },
      { count: batchesCount },
    ] = await Promise.all([
      admin.from('people').select('*', { count: 'exact', head: true }),
      admin.from('attendance_records').select('*', { count: 'exact', head: true }),
      admin.from('attendance_photos').select('*', { count: 'exact', head: true }),
      admin.from('import_batches').select('*', { count: 'exact', head: true }),
    ]);

    return NextResponse.json({
      success: true,
      counts: {
        people: peopleCount || 0,
        attendance: attendanceCount || 0,
        photos: photosCount || 0,
        batches: batchesCount || 0,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch counts' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (!body || (!body.confirm && body.confirm !== 'PURGE_ALL_DATA')) {
      return NextResponse.json(
        { error: 'Confirmation required. Pass { "confirm": "PURGE_ALL_DATA" } to proceed.' },
        { status: 400 }
      );
    }

    const isPlaceholder =
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder') ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-id');

    if (isPlaceholder) {
      const devStore = getDevStorage();
      const countPeople = devStore.people.length;
      const countAttendance = devStore.attendanceRecords.length;

      devStore.people = [];
      devStore.attendanceRecords = [];

      return NextResponse.json({
        success: true,
        message: 'All old attendee and attendance data removed successfully.',
        deleted: {
          people: countPeople,
          attendance_records: countAttendance,
        },
      });
    }

    const admin = createAdminClient();

    // 1. Fetch current counts
    const [
      { count: peopleCount },
      { count: attendanceCount },
      { count: photosCount },
      { count: batchesCount },
    ] = await Promise.all([
      admin.from('people').select('*', { count: 'exact', head: true }),
      admin.from('attendance_records').select('*', { count: 'exact', head: true }),
      admin.from('attendance_photos').select('*', { count: 'exact', head: true }),
      admin.from('import_batches').select('*', { count: 'exact', head: true }),
    ]);

    // 2. Delete attendance_photos metadata first
    await admin
      .from('attendance_photos')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    // 3. Delete attendance_records (due to foreign key constraint with people)
    await admin
      .from('attendance_records')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    // 4. Delete sync_conflicts
    await admin
      .from('sync_conflicts')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    // 5. Delete all people records
    await admin
      .from('people')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    // 6. Delete import errors and batches
    await admin
      .from('import_errors')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    await admin
      .from('import_batches')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    // 7. Delete storage objects in mrf-attendance-photos bucket
    try {
      const { data: fileList } = await admin.storage
        .from('mrf-attendance-photos')
        .list('photos', { limit: 1000 });

      if (fileList && fileList.length > 0) {
        const pathsToDelete = fileList.map((f) => `photos/${f.name}`);
        await admin.storage.from('mrf-attendance-photos').remove(pathsToDelete);
      }
    } catch (storageErr) {
      console.warn('Storage purge warning (non-fatal):', storageErr);
    }

    // 8. Log the purge event in audit trail
    await recordAuditLog({
      action: 'SYSTEM_DATA_PURGE',
      entityType: 'system',
      outcome: 'success',
      metadata: {
        purged_people: peopleCount || 0,
        purged_attendance: attendanceCount || 0,
        purged_photos: photosCount || 0,
        purged_batches: batchesCount || 0,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'All old attendee records, attendance logs, and test photos have been successfully deleted.',
      deleted: {
        people: peopleCount || 0,
        attendance_records: attendanceCount || 0,
        attendance_photos: photosCount || 0,
        import_batches: batchesCount || 0,
      },
    });
  } catch (err: any) {
    console.error('Reset data error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to remove old data.' },
      { status: 500 }
    );
  }
}
