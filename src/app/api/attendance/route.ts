import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const category = searchParams.get('category') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = (page - 1) * limit;

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
          phd_id
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

    // Generate short-lived signed URLs for photographs
    const recordsWithSignedPhotos = await Promise.all(
      (records || []).map(async (rec: any) => {
        let photoSignedUrl = null;
        const photo = Array.isArray(rec.attendance_photos)
          ? rec.attendance_photos[0]
          : rec.attendance_photos;

        if (photo && photo.storage_object_key) {
          try {
            const { data: signed } = await admin.storage
              .from('mrf-attendance-photos')
              .createSignedUrl(photo.storage_object_key, 600); // 10 minutes

            if (signed?.signedUrl) {
              photoSignedUrl = signed.signedUrl;
            }
          } catch (e) {
            console.warn('Failed to sign photo url:', e);
          }
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
          },
          photo: {
            available: !!photoSignedUrl,
            signed_url: photoSignedUrl,
            file_size: photo?.file_size || 0,
            content_type: photo?.content_type || 'image/jpeg',
          },
        };
      })
    );

    return NextResponse.json({
      success: true,
      records: recordsWithSignedPhotos,
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err: any) {
    console.error('Attendance GET exception:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
