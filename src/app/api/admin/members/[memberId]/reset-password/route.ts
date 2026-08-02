export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession, hashPassword, generatePassword } from '@/lib/auth';
import { sendPasswordReset } from '@/lib/whatsapp';
import { logAudit } from '@/lib/audit';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  return session && (session as { role: string }).role === 'admin' ? session : null;
}

export async function POST(req: NextRequest, { params }: { params: { memberId: string } }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getServiceClient();
  const { data: member } = await db
    .from('members')
    .select('id, name, phone')
    .eq('id', params.memberId)
    .single();

  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

  const newPassword = generatePassword(8);
  const hash = await hashPassword(newPassword);

  const { error } = await db
    .from('members')
    // Bumping sessions_valid_from kills sessions issued with the old password —
    // a reset previously left existing 7-day logins working.
    .update({ password_hash: hash, must_change_password: true, sessions_valid_from: new Date().toISOString() })
    .eq('id', params.memberId);

  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });

  // Never log the password itself.
  logAudit((admin as { phone: string }).phone, 'member_password_reset', 'member', params.memberId, {
    member: member.name,
  }).catch(() => {});

  // Send via WhatsApp (fire & forget). Also return the password so the admin
  // can relay it manually — critical while the WhatsApp API isn't live yet.
  sendPasswordReset(member.phone, member.name, newPassword).catch((e) =>
    console.error('WhatsApp password reset failed:', e)
  );

  return NextResponse.json({ ok: true, password: newPassword, phone: member.phone, name: member.name });
}
