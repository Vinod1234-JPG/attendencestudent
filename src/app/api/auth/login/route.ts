import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
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
    const masterPassword = process.env.ADMIN_PASSWORD || 'MRF@Conclave2026';
    const isMasterCredential =
      (trimmedEmail === 'admin@mrf.org' || trimmedEmail === 'convener@mrf.org') &&
      password === masterPassword;

    const isPlaceholder =
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');

    // 1. Authorized Master Administrator credentials always succeed
    if (isMasterCredential) {
      // In live Supabase mode, ensure the admin account exists in Supabase Auth & profiles
      if (!isPlaceholder) {
        try {
          const adminClient = createAdminClient();
          const { data: newUser } = await adminClient.auth.admin.createUser({
            email: trimmedEmail,
            password: password,
            email_confirm: true,
            user_metadata: { role: 'admin' },
          });

          if (newUser?.user) {
            await adminClient.from('profiles').upsert({
              id: newUser.user.id,
              role: 'admin',
              full_name: trimmedEmail === 'admin@mrf.org' ? 'MRF Administrator' : 'MRF Convener',
            });
          }
        } catch {
          // If already created or network glitch, proceed with authorized session
        }
      }

      await recordAuditLog({
        actorId: null,
        action: 'ADMIN_LOGIN',
        entityType: 'AUTH',
        entityId: trimmedEmail,
        outcome: 'success',
        metadata: { mode: isPlaceholder ? 'development_mode' : 'master_admin', email: trimmedEmail },
      });

      const response = NextResponse.json({
        success: true,
        user: { email: trimmedEmail, role: 'admin' },
        message: 'MRF Administrator login successful',
      });

      response.cookies.set('mrf_admin_session', 'active', {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24, // 24 hours
      });

      return response;
    }

    // 2. Reject invalid credentials in local development mode
    if (isPlaceholder) {
      return NextResponse.json(
        {
          error:
            'Invalid credentials. (For MRF Admin access, use admin@mrf.org / MRF@Conclave2026)',
        },
        { status: 401 }
      );
    }

    // 3. For custom admin accounts, authenticate with live Supabase Auth
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
