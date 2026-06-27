export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession, verifyPassword, hashPassword } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  if (!session || (session as { role: string }).role !== 'member') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { memberId } = session as { memberId: string };

  const { currentPassword, newPassword } = await req.json();
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Both passwords required' }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }
  if (!/[A-Z]/.test(newPassword)) {
    return NextResponse.json({ error: 'Password must contain at least one uppercase letter' }, { status: 400 });
  }
  if (!/[0-9]/.test(newPassword)) {
    return NextResponse.json({ error: 'Password must contain at least one number' }, { status: 400 });
  }
  if (currentPassword === newPassword) {
    return NextResponse.json({ error: 'New password must be different from current password' }, { status: 400 });
  }

  const db = getServiceClient();
  const { data: member } = await db.from('members').select('password_hash').eq('id', memberId).single();
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

  const valid = await verifyPassword(currentPassword, member.password_hash);
  if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });

  const newHash = await hashPassword(newPassword);
  await db.from('members').update({ password_hash: newHash, must_change_password: false }).eq('id', memberId);

  return NextResponse.json({ success: true });
}
