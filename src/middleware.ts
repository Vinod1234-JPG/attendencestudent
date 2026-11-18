import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase/config';
import { createServerClient } from '@supabase/ssr';
import {
  AdminIdentity,
  DEV_SESSION_COOKIE,
  getSupabaseAdmin,
  isAdminRole,
  isPlaceholderMode,
  verifyDevSession,
} from '@/lib/auth/adminSession';
import {
  ADMIN_CACHE_COOKIE,
  adminCacheCookieOptions,
  signAdminCache,
  verifyAdminCache,
} from '@/lib/auth/adminCache';

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

/** Teachers may use the dashboard, but not these (global settings, other people's data, accounts). */
const ADMIN_ONLY_API = ['/api/admin/teachers', '/api/admin/reset-data', '/api/audit', '/api/sync/conflicts'];
const ADMIN_ONLY_PAGES = ['/admin/teachers', '/admin/event', '/admin/audit', '/admin/sync'];

function isAdminOnly(pathname: string): boolean {
  return [...ADMIN_ONLY_API, ...ADMIN_ONLY_PAGES].some((p) => pathname === p || pathname.startsWith(p + '/'));
}

/** Response for a teacher who asked for an admin-only API or page. */
function denyTeacher(request: NextRequest, isApi: boolean) {
  if (isApi) {
    return NextResponse.json(
      { error: 'This action is for administrators only.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  const home = request.nextUrl.clone();
  home.pathname = '/admin';
  home.search = '';
  return NextResponse.redirect(home);
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
    // Fast path: verified a moment ago (signed cookie). No network round trips to the database.
    const cached = await verifyAdminCache(request.cookies.get(ADMIN_CACHE_COOKIE)?.value);
    if (cached) {
      if (!isAdminRole(cached.role) && isAdminOnly(pathname)) return denyTeacher(request, isApi);
      return response;
    }

    const supabase = createServerClient(
      getSupabaseUrl()!,
      getSupabaseAnonKey() || 'missing-anon-key',
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

  if (admin) {
    if (!isAdminRole(admin.role) && isAdminOnly(pathname)) return denyTeacher(request, isApi);
    if (!isPlaceholderMode()) {
      const value = await signAdminCache(admin);
      if (value) response.cookies.set(ADMIN_CACHE_COOKIE, value, adminCacheCookieOptions);
    }
    return response;
  }

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
