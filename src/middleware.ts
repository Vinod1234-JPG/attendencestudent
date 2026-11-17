import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import {
  AdminIdentity,
  DEV_SESSION_COOKIE,
  getSupabaseAdmin,
  isPlaceholderMode,
  verifyDevSession,
} from '@/lib/auth/adminSession';

/**
 * API routes the public kiosk (unauthenticated) needs. Everything else under /api
 * and every /admin page requires a signed-in administrator.
 * Route handlers also check `requireAdmin()` themselves as a second layer.
 */
const PUBLIC_API_PREFIXES = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/kiosk/',
  '/api/sync/upload',
];

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');

  if (isApi && isPublicApi(pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  let admin: AdminIdentity | null = null;

  if (isPlaceholderMode()) {
    admin = await verifyDevSession(request.cookies.get(DEV_SESSION_COOKIE)?.value);
  } else {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            // Persist refreshed Supabase session tokens on both request and response.
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );
    try {
      admin = await getSupabaseAdmin(supabase);
    } catch {
      admin = null;
    }
  }

  if (admin) return response;

  if (isApi) {
    return NextResponse.json(
      { error: 'Authentication required. Please sign in as an administrator.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.search = '';
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/:path*'],
};
