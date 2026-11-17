import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/utils/audit';
import { requireAdmin } from '@/lib/auth/requireAdmin';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  try {
    const admin = createAdminClient();
    const { data: conflicts, error } = await admin
      .from('sync_conflicts')
      .select('*, people(name, category, normalized_email, phd_id), event_sessions(name)')
      .order('server_received_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, conflicts: conflicts || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  try {
    const { conflict_id, resolution_action, notes } = await request.json();

    if (!conflict_id || !resolution_action) {
      return NextResponse.json(
        { error: 'Conflict ID and resolution action are required.' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    const { data: updated, error } = await admin
      .from('sync_conflicts')
      .update({
        status: resolution_action === 'accept' ? 'resolved_accepted' : 'resolved_ignored',
        resolution_notes: notes || '',
        resolved_at: nowIso,
      })
      .eq('id', conflict_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await recordAuditLog({
      action: 'SYNC_CONFLICT_RESOLVED',
      entityType: 'SYNC_CONFLICT',
      entityId: conflict_id,
      outcome: 'success',
      metadata: { resolution_action, notes },
    });

    return NextResponse.json({ success: true, conflict: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
