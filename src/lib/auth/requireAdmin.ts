import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  AdminIdentity,
  DEV_SESSION_COOKIE,
  getSupabaseAdmin,
  isPlaceholderMode,
  verifyDevSession,
} from './adminSession';

/** Returns the current admin, or null if the request is not from a signed-in admin. */
export async function getCurrentAdmin(): Promise<AdminIdentity | null> {
  if (isPlaceholderMode()) {
    return verifyDevSession(cookies().get(DEV_SESSION_COOKIE)?.value);
  }
  try {
    return await getSupabaseAdmin(createServerSupabaseClient());
  } catch {
    return null;
  }
}

/**
 * Guard for admin-only route handlers:
 *
 *   const auth = await requireAdmin();
 *   if (auth.response) return auth.response;
 */
export async function requireAdmin(): Promise<
  { admin: AdminIdentity; response?: undefined } | { admin?: undefined; response: NextResponse }
> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return {
      response: NextResponse.json(
        { error: 'Authentication required. Please sign in as an administrator.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      ),
    };
  }
  return { admin };
}
