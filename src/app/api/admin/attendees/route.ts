import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDevStorage } from '@/lib/db/devStore';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryFilter = searchParams.get('category') || '';
    const statusFilter = searchParams.get('status') || '';
    const search = (searchParams.get('search') || '').trim().toLowerCase();

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
            (p.phd_id && p.phd_id.toLowerCase().includes(search))
        );
      }

      const totalGuides = devStore.people.filter((p) => p.category === 'guide').length;
      const totalScholars = devStore.people.filter((p) => p.category === 'phd_scholar').length;
      const totalAttended = devStore.attendanceRecords.length;
      const attendedGuides = people.filter((p) => p.category === 'guide' && p.attended).length;
      const attendedScholars = people.filter((p) => p.category === 'phd_scholar' && p.attended).length;

      return NextResponse.json(
        {
          success: true,
          counts: {
            total: devStore.people.length,
            guides: totalGuides,
            scholars: totalScholars,
            attended: totalAttended,
            pending: Math.max(0, devStore.people.length - totalAttended),
            attendedGuides,
            attendedScholars,
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

    // 1. Fetch all registered people
    const { data: peopleRaw, error: peopleErr } = await admin
      .from('people')
      .select('*');

    if (peopleErr) {
      console.error('Fetch attendees error:', peopleErr);
      return NextResponse.json({ error: peopleErr.message }, { status: 500 });
    }

    // 2. Fetch all attendance records with photos
    const { data: attendanceRaw } = await admin
      .from('attendance_records')
      .select('id, person_id, captured_at_device, status, attendance_photos(storage_object_key)');

    const attendanceMap = new Map<string, any>();
    (attendanceRaw || []).forEach((att) => {
      attendanceMap.set(att.person_id, att);
    });

    const allPeople = peopleRaw || [];
    const totalGuides = allPeople.filter((p) => p.category === 'guide').length;
    const totalScholars = allPeople.filter((p) => p.category === 'phd_scholar').length;
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
          (p.phd_id && p.phd_id.toLowerCase().includes(search))
      );
    }

    const attendedGuides = attendees.filter((p) => p.category === 'guide' && p.attended).length;
    const attendedScholars = attendees.filter((p) => p.category === 'phd_scholar' && p.attended).length;

    return NextResponse.json(
      {
        success: true,
        counts: {
          total: allPeople.length,
          guides: totalGuides,
          scholars: totalScholars,
          attended: totalAttended,
          pending: Math.max(0, allPeople.length - totalAttended),
          attendedGuides,
          attendedScholars,
        },
        attendees,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (err: any) {
    console.error('Attendees API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
