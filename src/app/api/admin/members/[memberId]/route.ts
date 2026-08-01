export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  return session && (session as { role: string }).role === 'admin'
    ? (session as { phone: string })
    : null;
}

export async function PATCH(req: NextRequest, { params }: { params: { memberId: string } }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { is_active } = await req.json();
  if (typeof is_active !== 'boolean') {
    return NextResponse.json({ error: 'is_active must be a boolean' }, { status: 400 });
  }
  const db = getServiceClient();
  // Deactivating must also revoke live sessions — tokens last 7 days, so
  // without this a deactivated member stayed logged in.
  const patch: Record<string, unknown> = { is_active };
  if (!is_active) patch.sessions_valid_from = new Date().toISOString();
  const { error } = await db.from('members').update(patch).eq('id', params.memberId);
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  logAudit(admin.phone, is_active ? 'member_activated' : 'member_deactivated', 'member', params.memberId).catch(() => {});
  return NextResponse.json({ success: true });
}
