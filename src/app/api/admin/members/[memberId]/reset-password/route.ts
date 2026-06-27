export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession, hashPassword, generatePassword } from '@/lib/auth';
import { sendPasswordReset } from '@/lib/whatsapp';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  return session && (session as { role: string }).role === 'admin' ? session : null;
}

export async function POST(req: NextRequest, { params }: { params: { memberId: string } }) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    .update({ password_hash: hash, must_change_password: true })
    .eq('id', params.memberId);

  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });

  // Send via WhatsApp (fire & forget)
  sendPasswordReset(member.phone, member.name, newPassword).catch((e) =>
    console.error('WhatsApp password reset failed:', e)
  );

  return NextResponse.json({ ok: true });
}
