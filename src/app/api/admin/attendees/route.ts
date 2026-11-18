import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDevStorage } from '@/lib/db/devStore';
import { requireAdmin, requireStaff } from '@/lib/auth/requireAdmin';
import { isTeacher } from '@/lib/auth/staffScope';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET(request: Request) {
  const auth = await requireStaff();
  if (auth.response) return auth.response;

  noStore();
  try {
    const { searchParams } = new URL(request.url);
    const categoryFilter = searchParams.get('category') || '';
    const statusFilter = searchParams.get('status') || '';
    const search = (searchParams.get('search') || '').trim().toLowerCase();
    // Teachers only ever see the students they registered.
    const onlyMine = isTeacher(auth.admin) ? auth.admin.id : null;

    const isPlaceholder =
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');

    if (isPlaceholder) {
      const devStore = getDevStorage();
      let people = devStore.people.map((p) => {
        const att = devStore.attendanceRecords.find((r) => r.attendee.id === p.id);
        return {
          id: p.id,
          name: p.name,
          category: p.category,
          email: p.normalized_email || p.metadata?.Email || p.metadata?.email || null,
          phd_id: p.phd_id || null,
          college: p.college || p.metadata?.College || null,
          registered_at: p.created_at || null,
          metadata: p.metadata || {},
          attended: !!att,
          attended_at: att?.captured_at_device || null,
          photo_url: att?.photo?.signed_url || null,
        };
      });

      if (categoryFilter && categoryFilter !== 'all') {
        people = people.filter((p) => p.category === categoryFilter);
      }
      if (statusFilter === 'attended') {
        people = people.filter((p) => p.attended);
      } else if (statusFilter === 'pending') {
        people = people.filter((p) => !p.attended);
      }
      if (search) {
        people = people.filter(
          (p) =>
            p.name.toLowerCase().includes(search) ||
            (p.email && p.email.toLowerCase().includes(search)) ||
            (p.phd_id && p.phd_id.toLowerCase().includes(search)) ||
            (p.college && p.college.toLowerCase().includes(search))
        );
      }

      const totalGuides = devStore.people.filter((p) => p.category === 'guide').length;
      const totalScholars = devStore.people.filter((p) => p.category === 'phd_scholar').length;
      const totalStudents = devStore.people.filter((p) => p.category === 'student').length;
      const totalAttended = devStore.attendanceRecords.length;
      const attendedGuides = people.filter((p) => p.category === 'guide' && p.attended).length;
      const attendedScholars = people.filter((p) => p.category === 'phd_scholar' && p.attended).length;
      const attendedStudents = people.filter((p) => p.category === 'student' && p.attended).length;

      return NextResponse.json(
        {
          success: true,
          counts: {
            total: devStore.people.length,
            guides: totalGuides,
            scholars: totalScholars,
            students: totalStudents,
            attended: totalAttended,
            pending: Math.max(0, devStore.people.length - totalAttended),
            attendedGuides,
            attendedScholars,
            attendedStudents,
          },
          attendees: people,
        },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
          },
        }
      );
    }

    const admin = createAdminClient();

    // Lightweight mode for the dashboard: totals only, three tiny count queries instead of the full list.
    if (searchParams.get('summary') === '1') {
      let qAll = admin.from('people').select('*', { count: 'exact', head: true });
      let qStudents = admin.from('people').select('*', { count: 'exact', head: true }).eq('category', 'student');
      let qAttended = admin.from('attendance_records').select('*', { count: 'exact', head: true });
      if (onlyMine) {
        qAll = qAll.eq('registered_by', onlyMine);
        qStudents = qStudents.eq('registered_by', onlyMine);
        qAttended = qAttended.eq('registered_by', onlyMine);
      }
      const [all, students, attended] = await Promise.all([qAll, qStudents, qAttended]);
      const total = all.count || 0;
      return NextResponse.json(
        {
          success: true,
          counts: {
            total,
            students: students.count || 0,
            attended: attended.count || 0,
            pending: Math.max(0, total - (attended.count || 0)),
          },
        },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      );
    }

    // 1 + 2. Fetch all registered people and all attendance records (with photos) at the same time
    let peopleQuery = admin.from('people').select('id, name, category, normalized_email, phd_id, college, created_at, metadata');
    let attendanceQuery = admin
      .from('attendance_records')
      .select('id, person_id, captured_at_device, status, attendance_photos(storage_object_key)');
    if (onlyMine) {
      peopleQuery = peopleQuery.eq('registered_by', onlyMine);
      attendanceQuery = attendanceQuery.eq('registered_by', onlyMine);
    }
    const [peopleRes, attendanceRes] = await Promise.all([peopleQuery, attendanceQuery]);
    const { data: peopleRaw, error: peopleErr } = peopleRes;
    const { data: attendanceRaw } = attendanceRes;

    if (peopleErr) {
      console.error('Fetch attendees error:', peopleErr);
      return NextResponse.json({ error: peopleErr.message }, { status: 500 });
    }

    const attendanceMap = new Map<string, any>();
    (attendanceRaw || []).forEach((att) => {
      attendanceMap.set(att.person_id, att);
    });

    const allPeople = peopleRaw || [];
    const totalGuides = allPeople.filter((p) => p.category === 'guide').length;
    const totalScholars = allPeople.filter((p) => p.category === 'phd_scholar').length;
    const totalStudents = allPeople.filter((p) => p.category === 'student').length;
    const totalAttended = attendanceMap.size;

    let attendees = allPeople.map((p) => {
      const att = attendanceMap.get(p.id);
      const photoObj = Array.isArray(att?.attendance_photos)
        ? att.attendance_photos[0]
        : att?.attendance_photos;

      const photoUrl = photoObj?.storage_object_key
        ? `/api/attendance/photo?key=${encodeURIComponent(photoObj.storage_object_key)}`
        : null;

      // Extract best email
      let email = p.normalized_email;
      if (!email && p.metadata) {
        email = p.metadata.Email || p.metadata.email || p.metadata['Email ID'] || p.metadata['Email Address'] || null;
      }
      if (!email && p.phd_id && p.phd_id.includes('@')) {
        email = p.phd_id.toLowerCase();
      }

      return {
        id: p.id,
        name: p.name,
        category: p.category,
        email: email || null,
        phd_id: p.phd_id || null,
        college: p.college || p.metadata?.College || null,
        registered_at: p.created_at || null,
        metadata: p.metadata || {},
        attended: !!att,
        attended_at: att?.captured_at_device || null,
        photo_url: photoUrl,
      };
    });

    // Sort by name
    attendees.sort((a, b) => a.name.localeCompare(b.name));

    // Filters
    if (categoryFilter && categoryFilter !== 'all') {
      attendees = attendees.filter((p) => p.category === categoryFilter);
    }
    if (statusFilter === 'attended') {
      attendees = attendees.filter((p) => p.attended);
    } else if (statusFilter === 'pending') {
      attendees = attendees.filter((p) => !p.attended);
    }
    if (search) {
      attendees = attendees.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          (p.email && p.email.toLowerCase().includes(search)) ||
          (p.phd_id && p.phd_id.toLowerCase().includes(search)) ||
          (p.college && p.college.toLowerCase().includes(search))
      );
    }

    const attendedGuides = attendees.filter((p) => p.category === 'guide' && p.attended).length;
    const attendedScholars = attendees.filter((p) => p.category === 'phd_scholar' && p.attended).length;
    const attendedStudents = attendees.filter((p) => p.category === 'student' && p.attended).length;

    return NextResponse.json(
      {
        success: true,
        counts: {
          total: allPeople.length,
          guides: totalGuides,
          scholars: totalScholars,
          students: totalStudents,
          attended: totalAttended,
          pending: Math.max(0, allPeople.length - totalAttended),
          attendedGuides,
          attendedScholars,
          attendedStudents,
        },
        attendees,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'CDN-Cache-Control': 'no-store',
          'Vercel-CDN-Cache-Control': 'no-store',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (err: any) {
    console.error('Attendees API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  noStore();
  try {
    const isPlaceholder =
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder') ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-id');

    if (isPlaceholder) {
      const devStore = getDevStorage();
      const count = devStore.people.length;
      devStore.people = [];
      devStore.attendanceRecords = [];
      return NextResponse.json({
        success: true,
        message: 'All old dev attendee data deleted.',
        deletedCount: count,
      });
    }

    const admin = createAdminClient();

    // 1. Delete attendance_photos metadata
    await admin.from('attendance_photos').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // 2. Delete attendance_records (due to foreign key constraint with people)
    await admin.from('attendance_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // 3. Delete sync_conflicts
    await admin.from('sync_conflicts').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // 4. Delete people
    const { count: peopleCount } = await admin.from('people').select('*', { count: 'exact', head: true });
    await admin.from('people').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // 5. Delete import errors and batches
    await admin.from('import_errors').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await admin.from('import_batches').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // 6. Delete storage objects
    try {
      const { data: files } = await admin.storage.from('mrf-attendance-photos').list('photos', { limit: 1000 });
      if (files && files.length > 0) {
        await admin.storage.from('mrf-attendance-photos').remove(files.map((f) => `photos/${f.name}`));
      }
    } catch (e) {
      console.warn('Storage purge non-fatal:', e);
    }

    return NextResponse.json({
      success: true,
      message: 'All old attendee records and test data successfully deleted.',
      deletedPeople: peopleCount || 0,
    });
  } catch (err: any) {
    console.error('Delete attendees error:', err);
    return NextResponse.json({ error: err.message || 'Failed to delete attendees' }, { status: 500 });
  }
}
