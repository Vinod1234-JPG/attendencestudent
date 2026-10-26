import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return new NextResponse('Missing photo key', { status: 400 });
    }

    const admin = createAdminClient();
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
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=86400',
      },
    });
  } catch (err: any) {
    console.error('Photo serve error:', err);
    return new NextResponse('Internal error', { status: 500 });
  }
}
