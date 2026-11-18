import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { isPlaceholderMode } from '@/lib/auth/adminSession';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/utils/audit';
import { CONFIG_HELP, SupabaseConfigError } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIGRATION_HINT =
  'Database update needed: run supabase/migrations/00004_teachers.sql in the Supabase SQL Editor, then try again.';

type Admin = ReturnType<typeof createAdminClient>;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: NO_STORE });

const needsSupabase = () =>
  fail('Teacher accounts need the live Supabase connection. They are not available in local test mode.', 503);

function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 8) return 'The password must be at least 8 characters.';
  if (password.length > 72) return 'The password must be at most 72 characters.';
  return null;
}

/** Returns the teacher's profile, or null if the id is not a teacher (admins cannot be edited here). */
async function loadTeacher(admin: Admin, id: unknown) {
  if (typeof id !== 'string' || id.length < 8) return null;
  const { data } = await admin.from('profiles').select('id, role, full_name').eq('id', id).maybeSingle();
  return data && data.role === 'teacher' ? data : null;
}

/** Lists every teacher with how many students they have registered. */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  if (isPlaceholderMode()) return needsSupabase();

  try {
    const admin = createAdminClient();
    const { data: profiles, error } = await admin
      .from('profiles')
      .select('id, role, full_name, created_at')
      .eq('role', 'teacher');
    if (error) return fail(error.message, 500);

    const teachers = profiles || [];
    const ids = teachers.map((t: any) => t.id);

    const emailById = new Map<string, { email: string; last: string | null }>();
    if (ids.length > 0) {
      const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
      (data?.users || []).forEach((u: any) => emailById.set(u.id, { email: u.email || '', last: u.last_sign_in_at || null }));
    }

    const counts = new Map<string, number>();
    if (ids.length > 0) {
      const { data: att } = await admin.from('attendance_records').select('registered_by').in('registered_by', ids);
      (att || []).forEach((r: any) => r.registered_by && counts.set(r.registered_by, (counts.get(r.registered_by) || 0) + 1));
    }

    const list = teachers
      .map((t: any) => ({
        id: t.id,
        full_name: t.full_name || '',
        email: emailById.get(t.id)?.email || '',
        created_at: t.created_at,
        last_sign_in_at: emailById.get(t.id)?.last || null,
        registrations: counts.get(t.id) || 0,
      }))
      .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));

    return NextResponse.json({ success: true, teachers: list }, { headers: NO_STORE });
  } catch (err: any) {
    if (err instanceof SupabaseConfigError) return fail(CONFIG_HELP, 503);
    console.error('List teachers error:', err);
    return fail('Could not load the teachers.', 500);
  }
}

/** Creates a teacher login. The administrator chooses the email and password. */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  if (isPlaceholderMode()) return needsSupabase();

  try {
    const body = await request.json().catch(() => ({}));
    const fullName = typeof body.full_name === 'string' ? body.full_name.replace(/\s+/g, ' ').trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = body.password;

    if (fullName.length < 2 || fullName.length > 80) return fail('Enter the teacher\'s name (2 to 80 characters).', 400);
    if (!EMAIL_RE.test(email) || email.length > 254) return fail('Enter a valid email address.', 400);
    const pwError = validatePassword(password);
    if (pwError) return fail(pwError, 400);

    const admin = createAdminClient();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: 'teacher' },
    });

    if (createErr || !created?.user) {
      const msg = createErr?.message || '';
      if ((createErr as any)?.status === 422 || /already|registered|exists/i.test(msg)) {
        return fail('A user with this email already exists.', 409);
      }
      console.error('Create teacher failed:', msg);
      return fail(msg || 'Could not create the teacher.', 500);
    }

    const { error: profileErr } = await admin
      .from('profiles')
      .insert({ id: created.user.id, role: 'teacher', full_name: fullName });

    if (profileErr) {
      await admin.auth.admin.deleteUser(created.user.id); // roll back: no half-created teacher
      console.error('Create teacher profile failed:', profileErr.message);
      return fail(profileErr.code === '23514' ? MIGRATION_HINT : profileErr.message, 500);
    }

    await recordAuditLog({
      actorId: auth.admin.id,
      action: 'TEACHER_CREATED',
      entityType: 'TEACHER',
      entityId: created.user.id,
      outcome: 'success',
      metadata: { email, full_name: fullName },
    });

    return NextResponse.json(
      { success: true, teacher: { id: created.user.id, full_name: fullName, email } },
      { status: 201, headers: NO_STORE }
    );
  } catch (err: any) {
    if (err instanceof SupabaseConfigError) return fail(CONFIG_HELP, 503);
    console.error('Create teacher error:', err);
    return fail('Could not create the teacher.', 500);
  }
}

/** Resets a teacher's password and/or changes their name. */
export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  if (isPlaceholderMode()) return needsSupabase();

  try {
    const body = await request.json().catch(() => ({}));
    const admin = createAdminClient();
    const teacher = await loadTeacher(admin, body.id);
    if (!teacher) return fail('Teacher not found.', 404);

    const changes: string[] = [];

    if (body.password !== undefined) {
      const pwError = validatePassword(body.password);
      if (pwError) return fail(pwError, 400);
      const { error } = await admin.auth.admin.updateUserById(teacher.id, { password: body.password });
      if (error) return fail(error.message, 500);
      changes.push('password');
    }

    if (body.full_name !== undefined) {
      const fullName = typeof body.full_name === 'string' ? body.full_name.replace(/\s+/g, ' ').trim() : '';
      if (fullName.length < 2 || fullName.length > 80) return fail('Enter the teacher\'s name (2 to 80 characters).', 400);
      const { error } = await admin.from('profiles').update({ full_name: fullName }).eq('id', teacher.id);
      if (error) return fail(error.message, 500);
      changes.push('name');
    }

    if (changes.length === 0) return fail('Nothing to change.', 400);

    await recordAuditLog({
      actorId: auth.admin.id,
      action: 'TEACHER_UPDATED',
      entityType: 'TEACHER',
      entityId: teacher.id,
      outcome: 'success',
      metadata: { changed: changes },
    });

    return NextResponse.json({ success: true, changed: changes }, { headers: NO_STORE });
  } catch (err: any) {
    if (err instanceof SupabaseConfigError) return fail(CONFIG_HELP, 503);
    console.error('Update teacher error:', err);
    return fail('Could not update the teacher.', 500);
  }
}

/** Removes a teacher login. Students they registered stay in the system (they become unassigned). */
export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  if (isPlaceholderMode()) return needsSupabase();

  try {
    const id = new URL(request.url).searchParams.get('id');
    const admin = createAdminClient();
    const teacher = await loadTeacher(admin, id);
    if (!teacher) return fail('Teacher not found.', 404);

    const { error } = await admin.auth.admin.deleteUser(teacher.id);
    if (error) return fail(error.message, 500);
    await admin.from('profiles').delete().eq('id', teacher.id); // normally removed by the cascade already

    await recordAuditLog({
      actorId: auth.admin.id,
      action: 'TEACHER_REMOVED',
      entityType: 'TEACHER',
      entityId: teacher.id,
      outcome: 'success',
      metadata: { full_name: teacher.full_name },
    });

    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (err: any) {
    if (err instanceof SupabaseConfigError) return fail(CONFIG_HELP, 503);
    console.error('Remove teacher error:', err);
    return fail('Could not remove the teacher.', 500);
  }
}
