import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { recordAuditLog } from '@/lib/utils/audit';

export async function POST() {
  try {
    const supabase = createServerSupabaseClient();
    await supabase.auth.signOut();

    await recordAuditLog({
      action: 'ADMIN_LOGOUT',
      entityType: 'AUTH',
      outcome: 'success',
    });

    const response = NextResponse.json({ success: true });
    response.cookies.delete('mrf_admin_session');
    return response;
  } catch (err: any) {
    return NextResponse.json({ success: true });
  }
}
