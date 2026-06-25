export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifyPassword, signSession } from '@/lib/auth';

const ADMIN_PHONE = process.env.ADMIN_PHONE || '919999999999';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'azdah-admin-2024';

export async function POST(req: NextRequest) {
  const { phone, password } = await req.json();

  if (!phone || !password) {
    return NextResponse.json({ error: 'Phone and password required' }, { status: 400 });
  }

  // Admin check (hardcoded for simplicity — admin doesn't go through member table)
  if (phone === ADMIN_PHONE && password === ADMIN_PASSWORD) {
    const token = await signSession({ role: 'admin', phone });
    const res = NextResponse.json({ success: true, role: 'admin' });
    res.cookies.set('session', token, { httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/' });
    return res;
  }

  // Member login
  const db = getServiceClient();
  const { data: member } = await db
    .from('members')
    .select('id, password_hash, is_active, plan_end')
    .eq('phone', phone)
    .single();

  if (!member) {
    return NextResponse.json({ error: 'Invalid phone or password' }, { status: 401 });
  }
  if (!member.is_active) {
    return NextResponse.json({ error: 'Account inactive. Contact AZDAH.' }, { status: 403 });
  }

  const valid = await verifyPassword(password, member.password_hash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid phone or password' }, { status: 401 });
  }

  const token = await signSession({ role: 'member', memberId: member.id, phone });
  const res = NextResponse.json({ success: true, role: 'member' });
  res.cookies.set('session', token, { httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/' });
  return res;
}
