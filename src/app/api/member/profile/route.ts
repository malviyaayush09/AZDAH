export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  if (!session || (session as { role: string }).role !== 'member') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { memberId } = session as { memberId: string };

  const db = getServiceClient();
  const { data } = await db
    .from('members')
    .select('id, name, phone, email')
    .eq('id', memberId)
    .single();

  return NextResponse.json({ profile: data });
}

export async function PATCH(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  if (!session || (session as { role: string }).role !== 'member') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { memberId } = session as { memberId: string };

  const { name, email } = await req.json();

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (trimmed.length < 3) return NextResponse.json({ error: 'Name must be at least 3 characters' }, { status: 400 });
    if (/\d/.test(trimmed)) return NextResponse.json({ error: 'Name should not contain numbers' }, { status: 400 });
  }

  const updates: Record<string, string> = {};
  if (name) updates.name = String(name).trim();
  if (email !== undefined) updates.email = String(email).trim() || '';

  const db = getServiceClient();
  const { error } = await db.from('members').update(updates).eq('id', memberId);
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });

  return NextResponse.json({ success: true });
}
