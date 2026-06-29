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
  const { error } = await db.from('members').update({ is_active }).eq('id', params.memberId);
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  logAudit(admin.phone, is_active ? 'member_activated' : 'member_deactivated', 'member', params.memberId).catch(() => {});
  return NextResponse.json({ success: true });
}
