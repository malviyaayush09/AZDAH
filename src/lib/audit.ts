import { getServiceClient } from '@/lib/supabase';

export async function logAudit(
  adminPhone: string,
  action: string,
  entityType?: string,
  entityId?: string,
  details?: Record<string, unknown>
) {
  const db = getServiceClient();
  await db.from('admin_audit_log').insert({
    admin_phone: adminPhone,
    action,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
    details: details ?? null,
  });
}
