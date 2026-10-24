import { createAdminClient } from '../supabase/admin';

export interface AuditLogParams {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  outcome?: 'success' | 'failure' | 'warning';
  metadata?: Record<string, any>;
}

export async function recordAuditLog(params: AuditLogParams) {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('audit_logs').insert({
      actor_id: params.actorId || null,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId || null,
      outcome: params.outcome || 'success',
      metadata: params.metadata || {},
    });

    if (error) {
      console.warn('[Audit Log Insert Warning]:', error.message);
    }
  } catch (err) {
    console.warn('[Audit Log Failure]:', err);
  }
}
