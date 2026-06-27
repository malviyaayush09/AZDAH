export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { signSession } from '@/lib/auth';

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 24 * 7,
  path: '/',
};

export async function POST(req: NextRequest) {
  const { phone, otp } = await req.json() as { phone: string; otp: string };

  if (!phone || !otp) {
    return NextResponse.json({ error: 'Phone and OTP required' }, { status: 400 });
  }

  const db = getServiceClient();
  const { data: record } = await db
    .from('admin_otp')
    .select('id, otp, expires_at, used')
    .eq('phone', phone)
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!record) {
    return NextResponse.json({ error: 'OTP not found or already used' }, { status: 400 });
  }

  if (new Date(record.expires_at) < new Date()) {
    return NextResponse.json({ error: 'OTP expired. Please login again.' }, { status: 400 });
  }

  if (record.otp !== otp.trim()) {
    return NextResponse.json({ error: 'Incorrect OTP' }, { status: 400 });
  }

  // Mark OTP as used
  await db.from('admin_otp').update({ used: true }).eq('id', record.id);

  const token = await signSession({ role: 'admin', phone });
  const res = NextResponse.json({ success: true, role: 'admin' });
  res.cookies.set('session', token, COOKIE_OPTS);
  return res;
}
