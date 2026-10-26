import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDevStorage } from '@/lib/db/devStore';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const category = searchParams.get('category') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = (page - 1) * limit;

    const isPlaceholder =
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');

    if (isPlaceholder) {
      const devStore = getDevStorage();
      let records = [...devStore.attendanceRecords];

      if (category && (category === 'guide' || category === 'phd_scholar')) {
        records = records.filter((r) => r.attendee.category === category);
      }

      if (search.trim()) {
        const term = search.trim().toLowerCase();
        records = records.filter(
          (r) =>
            r.attendee.name.toLowerCase().includes(term) ||
            r.attendee.identifier.toLowerCase().includes(term)
        );
      }

      const total = records.length;
      const paginated = records.slice(offset, offset + limit);

      return NextResponse.json(
        {
          success: true,
          records: paginated,
          pagination: {
            page,
            limit,
            total,
            total_pages: Math.ceil(total / limit) || 1,
          },
        },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
          },
        }
      );
    }

    const admin = createAdminClient();

    let query = admin
      .from('attendance_records')
      .select(
        `
        id,
        operation_id,
        captured_at_device,
        received_at_server,
        status,
        session_id,
        person_id,
        people!inner (
          id,
          name,
          category,
          normalized_email,
          phd_id,
          metadata
        ),
        event_sessions (
          name
        ),
        attendance_photos (
          storage_object_key,
          content_type,
          file_size
        )
      `,
        { count: 'exact' }
      );

    if (category && (category === 'guide' || category === 'phd_scholar')) {
      query = query.eq('people.category', category);
    }

    if (search.trim()) {
      const term = search.trim();
      query = query.or(
        `name.ilike.%${term}%,normalized_email.ilike.%${term}%,phd_id.ilike.%${term}%`,
        { foreignTable: 'people' }
      );
    }

    query = query
      .order('captured_at_device', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: records, count, error } = await query;

    if (error) {
      console.error('Attendance fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Generate reliable app-proxied URLs for photographs so they never expire with JWT errors
    const recordsWithSignedPhotos = (records || []).map((rec: any) => {
      let photoSignedUrl = null;
      const photo = Array.isArray(rec.attendance_photos)
        ? rec.attendance_photos[0]
        : rec.attendance_photos;

      if (photo && photo.storage_object_key) {
        photoSignedUrl = `/api/attendance/photo?key=${encodeURIComponent(photo.storage_object_key)}`;
      }

      return {
        id: rec.id,
        operation_id: rec.operation_id,
        captured_at_device: rec.captured_at_device,
        received_at_server: rec.received_at_server,
        status: rec.status,
        session_name: rec.event_sessions?.name || 'Main Session',
        attendee: {
          id: rec.people.id,
          name: rec.people.name,
          category: rec.people.category,
          identifier:
            rec.people.category === 'guide'
              ? rec.people.normalized_email
              : rec.people.phd_id,
          extra_details: rec.people.metadata || {},
        },
        photo: {
          available: !!photoSignedUrl,
          signed_url: photoSignedUrl,
          file_size: photo?.file_size || 0,
          content_type: photo?.content_type || 'image/jpeg',
        },
      };
    });

    return NextResponse.json(
      {
        success: true,
        records: recordsWithSignedPhotos,
        pagination: {
          page,
          limit,
          total: count || 0,
          total_pages: Math.ceil((count || 0) / limit) || 1,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (err: any) {
    console.error('Attendance GET exception:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
