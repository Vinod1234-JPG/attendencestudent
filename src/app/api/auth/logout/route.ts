import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { recordAuditLog } from '@/lib/utils/audit';
import { getCurrentAdmin } from '@/lib/auth/requireAdmin';
import { DEV_SESSION_COOKIE, isPlaceholderMode } from '@/lib/auth/adminSession';
import { ADMIN_CACHE_COOKIE } from '@/lib/auth/adminCache';

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(DEV_SESSION_COOKIE);
  response.cookies.delete(ADMIN_CACHE_COOKIE);

  try {
    const admin = await getCurrentAdmin();

    if (!isPlaceholderMode()) {
      const supabase = createServerSupabaseClient();
      await supabase.auth.signOut();
    }

    if (admin) {
      await recordAuditLog({
        actorId: admin.id,
        action: 'ADMIN_LOGOUT',
        entityType: 'AUTH',
        entityId: admin.id || admin.email,
        outcome: 'success',
      });
    }
  } catch {
    // Logout should always succeed from the client's point of view.
  }

  return response;
}
