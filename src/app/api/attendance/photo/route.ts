import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStaff } from '@/lib/auth/requireAdmin';
import { isTeacher } from '@/lib/auth/staffScope';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireStaff();
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return new NextResponse('Missing photo key', { status: 400 });
    }

    const admin = createAdminClient();

    // A teacher may only open photos of check-ins they recorded.
    if (isTeacher(auth.admin)) {
      const { data: photo } = await admin
        .from('attendance_photos')
        .select('attendance_record_id')
        .eq('storage_object_key', key)
        .maybeSingle();
      let allowed = false;
      if (photo?.attendance_record_id) {
        const { data: rec } = await admin
          .from('attendance_records')
          .select('registered_by')
          .eq('id', photo.attendance_record_id)
          .maybeSingle();
        allowed = !!rec && rec.registered_by === auth.admin.id;
      }
      if (!allowed) return new NextResponse('Photo not found', { status: 404 });
    }
    const { data, error } = await admin.storage
      .from('mrf-attendance-photos')
      .download(key);

    if (error || !data) {
      console.warn('Photo download error:', error);
      return new NextResponse('Photo not found', { status: 404 });
    }

    const arrayBuffer = await data.arrayBuffer();
    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': data.type || 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err: any) {
    console.error('Photo serve error:', err);
    return new NextResponse('Internal error', { status: 500 });
  }
}
