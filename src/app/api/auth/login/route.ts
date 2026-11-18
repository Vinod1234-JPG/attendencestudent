import { NextResponse } from 'next/server';
import { timingSafeEqual, createHash } from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/utils/audit';
import { CONFIG_HELP, SupabaseConfigError } from '@/lib/supabase/config';
import { ADMIN_CACHE_COOKIE, adminCacheCookieOptions, signAdminCache } from '@/lib/auth/adminCache';
import {
  ADMIN_ROLES,
  DEV_SESSION_COOKIE,
  DEV_SESSION_MAX_AGE_SECONDS,
  isDevLoginConfigured,
  isPlaceholderMode,
  signDevSession,
} from '@/lib/auth/adminSession';

export const dynamic = 'force-dynamic';

/** Constant-time string comparison (hashing first equalises lengths). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json().catch(() => ({}));

    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // ------------------------------------------------------------------
    // Local development without Supabase: single admin from environment
    // ------------------------------------------------------------------
    if (isPlaceholderMode()) {
      if (!isDevLoginConfigured()) {
        return NextResponse.json(
          {
            error:
              'Development login is not configured. Set ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_SESSION_SECRET (32+ chars) in .env.local.',
          },
          { status: 503 }
        );
      }

      const expectedEmail = process.env.ADMIN_EMAIL!.trim().toLowerCase();
      const emailOk = safeEqual(trimmedEmail, expectedEmail);
      const passwordOk = safeEqual(password, process.env.ADMIN_PASSWORD!);

      if (!emailOk || !passwordOk) {
        return NextResponse.json(
          {
            error:
              'Invalid email or password. This server is running in local test mode (not connected to Supabase), so only the test login from .env.development.local works here.',
          },
          { status: 401 }
        );
      }

      const token = await signDevSession(expectedEmail);
      if (!token) {
        return NextResponse.json({ error: 'Session signing is not configured.' }, { status: 503 });
      }

      const response = NextResponse.json({
        success: true,
        user: { email: expectedEmail, role: 'admin' },
      });
      response.cookies.set(DEV_SESSION_COOKIE, token, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: DEV_SESSION_MAX_AGE_SECONDS,
      });
      return response;
    }

    // ------------------------------------------------------------------
    // Live mode: Supabase Auth + admin profile role
    // ------------------------------------------------------------------
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (error || !data.user) {
      await recordAuditLog({
        actorId: null,
        action: 'ADMIN_LOGIN_FAILED',
        entityType: 'AUTH',
        entityId: trimmedEmail,
        outcome: 'failure',
        metadata: { error: error?.message },
      });

      const status = (error as any)?.status as number | undefined;
      const code = (error as any)?.code as string | undefined;
      const isCredentialProblem =
        !error ||
        status === 400 ||
        status === 422 ||
        ['invalid_credentials', 'email_not_confirmed', 'user_banned'].includes(code || '');

      if (status === 429) {
        return NextResponse.json(
          { error: 'Too many sign-in attempts. Please wait a minute and try again.' },
          { status: 429 }
        );
      }
      if (!isCredentialProblem) {
        // e.g. "Invalid API key": the keys configured on the server are wrong, not the user's password.
        return NextResponse.json(
          { error: `${CONFIG_HELP} (Supabase said: ${error?.message || 'unknown error'})` },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .maybeSingle();

    if (!profile || !(ADMIN_ROLES as readonly string[]).includes(profile.role)) {
      await supabase.auth.signOut();
      await recordAuditLog({
        actorId: data.user.id,
        action: 'ADMIN_LOGIN_DENIED',
        entityType: 'AUTH',
        entityId: data.user.id,
        outcome: 'failure',
        metadata: { email: data.user.email, reason: 'no_admin_profile' },
      });
      return NextResponse.json(
        { error: 'Access denied: User is not authorized as an MRF administrator.' },
        { status: 403 }
      );
    }

    await recordAuditLog({
      actorId: data.user.id,
      action: 'ADMIN_LOGIN',
      entityType: 'AUTH',
      entityId: data.user.id,
      outcome: 'success',
      metadata: { email: data.user.email, role: profile.role },
    });

    // Supabase session cookies were set by the server client above.
    const response = NextResponse.json({
      success: true,
      user: { id: data.user.id, email: data.user.email, role: profile.role },
    });
    // Remove the legacy unsigned flag cookie if a browser still has it.
    response.cookies.delete(DEV_SESSION_COOKIE);
    // We just verified this admin: remember it briefly so the next requests skip the database round trips.
    const cacheValue = await signAdminCache({
      id: data.user.id,
      email: data.user.email || '',
      role: profile.role,
      mode: 'supabase',
    });
    if (cacheValue) response.cookies.set(ADMIN_CACHE_COOKIE, cacheValue, adminCacheCookieOptions);
    return response;
  } catch (err) {
    console.error('Login error:', err);
    if (err instanceof SupabaseConfigError) {
      return NextResponse.json({ error: `${CONFIG_HELP} (${err.message})` }, { status: 503 });
    }
    return NextResponse.json({ error: 'An unexpected server error occurred.' }, { status: 500 });
  }
}
