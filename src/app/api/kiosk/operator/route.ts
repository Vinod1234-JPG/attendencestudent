import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth/requireAdmin';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlaceholderMode } from '@/lib/auth/adminSession';

export const dynamic = 'force-dynamic';

/**
 * Public. Tells the kiosk who is signed in on this browser, so it can show "Registering as <name>".
 * Returns only the display name and role, never an email or id.
 */
export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const operator = await getCurrentAdmin();
    if (!operator) return NextResponse.json({ operator: null }, { headers });

    let name = '';
    if (operator.id && !isPlaceholderMode()) {
      try {
        const { data } = await createAdminClient().from('profiles').select('full_name').eq('id', operator.id).maybeSingle();
        name = data?.full_name || '';
      } catch {
        // fall back to the role label
      }
    }
    const role = operator.role === 'teacher' ? 'teacher' : 'admin';
    return NextResponse.json(
      { operator: { name: name || (role === 'teacher' ? 'Teacher' : 'Administrator'), role } },
      { headers }
    );
  } catch {
    return NextResponse.json({ operator: null }, { headers });
  }
}
