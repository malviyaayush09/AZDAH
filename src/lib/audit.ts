import { getServiceClient } from '@/lib/supabase';

export async function logAudit(
  adminPhone: string,
  action: string,
  entityType?: string,
  entityId?: string,
  details?: Record<string, unknown>
) {
  // Every call site awaits this. Before they did, the insert was fired and the
  // response returned immediately, and on Edge the function was torn down
  // mid-flight -- 247 admin actions had happened and exactly one row survived,
  // whichever one happened to win the race.
  //
  // Awaiting means a failure here would otherwise break the action that was
  // being logged, so this never throws: recording the change must not be able
  // to undo it.
  try {
    const db = getServiceClient();
    const { error } = await db.from('admin_audit_log').insert({
      admin_phone: adminPhone,
      action,
      entity_type: entityType ?? null,
      entity_id: entityId ?? null,
      details: details ?? null,
    });
    if (error) console.error('[audit] could not record', action, error.message);
  } catch (e) {
    console.error('[audit] could not record', action, e);
  }
}
