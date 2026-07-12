export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifyPassword, signSession } from '@/lib/auth';

const ADMIN_PHONE = process.env.ADMIN_PHONE;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 24 * 7,
  path: '/',
};

// Rate limiting: max 5 failed attempts per phone per 15 minutes
async function isRateLimited(db: ReturnType<typeof getServiceClient>, phone: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count } = await db
    .from('login_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('phone', phone)
    .eq('success', false)
    .gte('created_at', windowStart);
  return (count ?? 0) >= 5;
}

async function recordAttempt(db: ReturnType<typeof getServiceClient>, phone: string, success: boolean) {
  await db.from('login_attempts').insert({ phone, success });
  // Clean up old attempts > 1 hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  db.from('login_attempts').delete().lt('created_at', oneHourAgo).then(() => {});
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!phone || !password) {
    return NextResponse.json({ error: 'Phone and password required' }, { status: 400 });
  }

  // Basic phone format validation
  if (!/^\d{10,15}$/.test(phone)) {
    return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 });
  }

  const db = getServiceClient();

  if (await isRateLimited(db, phone)) {
    return NextResponse.json({ error: 'Too many failed attempts. Try again in 15 minutes.' }, { status: 429 });
  }

  // Admin check — direct login, no OTP for now
  if (ADMIN_PHONE && ADMIN_PASSWORD && phone === ADMIN_PHONE && password === ADMIN_PASSWORD) {
    await recordAttempt(db, phone, true);
    const token = await signSession({ role: 'admin', phone });
    const res = NextResponse.json({ success: true, role: 'admin' });
    res.cookies.set('session', token, COOKIE_OPTS);
    return res;
  }

  // Instructor login (checked before member — instructors aren't members)
  const { data: instructor } = await db
    .from('instructors')
    .select('id, password_hash, is_active')
    .eq('phone', phone)
    .maybeSingle();
  if (instructor) {
    if (!instructor.is_active) {
      return NextResponse.json({ error: 'Account inactive. Contact AZDAH.' }, { status: 403 });
    }
    const valid = await verifyPassword(password, instructor.password_hash);
    if (!valid) {
      await recordAttempt(db, phone, false);
      return NextResponse.json({ error: 'Invalid phone or password' }, { status: 401 });
    }
    await recordAttempt(db, phone, true);
    const token = await signSession({ role: 'instructor', instructorId: instructor.id, phone });
    const res = NextResponse.json({ success: true, role: 'instructor' });
    res.cookies.set('session', token, COOKIE_OPTS);
    return res;
  }

  // Member login
  const { data: member } = await db
    .from('members')
    .select('id, password_hash, is_active')
    .eq('phone', phone)
    .single();

  if (!member) {
    await recordAttempt(db, phone, false);
    return NextResponse.json({ error: 'Invalid phone or password' }, { status: 401 });
  }
  if (!member.is_active) {
    return NextResponse.json({ error: 'Account inactive. Contact AZDAH.' }, { status: 403 });
  }

  const valid = await verifyPassword(password, member.password_hash);
  if (!valid) {
    await recordAttempt(db, phone, false);
    return NextResponse.json({ error: 'Invalid phone or password' }, { status: 401 });
  }

  await recordAttempt(db, phone, true);
  const token = await signSession({ role: 'member', memberId: member.id, phone });
  const res = NextResponse.json({ success: true, role: 'member' });
  res.cookies.set('session', token, COOKIE_OPTS);
  return res;
}
