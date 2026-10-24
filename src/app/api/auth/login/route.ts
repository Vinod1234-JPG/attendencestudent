import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { recordAuditLog } from '@/lib/utils/audit';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();
    const supabase = createServerSupabaseClient();

    // Check if Supabase credentials are configured
    const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');

    if (isPlaceholder) {
      // In local dev without live Supabase cloud instance configured yet,
      // allow default MRF administrator credential or reject invalid credentials.
      if (
        (trimmedEmail === 'admin@mrf.org' || trimmedEmail === 'convener@mrf.org') &&
        password === 'MRF@Conclave2026'
      ) {
        await recordAuditLog({
          actorId: null,
          action: 'ADMIN_LOGIN',
          entityType: 'AUTH',
          entityId: trimmedEmail,
          outcome: 'success',
          metadata: { mode: 'development_fallback', email: trimmedEmail },
        });

        const response = NextResponse.json({
          success: true,
          user: { email: trimmedEmail, role: 'admin' },
          message: 'Development admin login successful',
        });

        // Set auth session cookie
        response.cookies.set('mrf_admin_session', 'active', {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 60 * 60 * 24, // 24 hours
        });

        return response;
      } else {
        return NextResponse.json(
          {
            error:
              'Invalid credentials. (Note: for development mode without live Supabase, use admin@mrf.org / MRF@Conclave2026)',
          },
          { status: 401 }
        );
      }
    }

    // Authenticate with live Supabase Auth
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

      return NextResponse.json(
        { error: error?.message || 'Invalid email or password.' },
        { status: 401 }
      );
    }

    // Verify authorized administrator profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      await supabase.auth.signOut();
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

    const response = NextResponse.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: profile.role,
      },
    });

    response.cookies.set('mrf_admin_session', 'active', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
    });

    return response;
  } catch (err: any) {
    console.error('Login error:', err);
    return NextResponse.json(
      { error: err.message || 'An unexpected server error occurred.' },
      { status: 500 }
    );
  }
}
