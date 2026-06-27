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

  const classId = req.nextUrl.searchParams.get('classId');
  if (!classId) return NextResponse.json({ error: 'classId required' }, { status: 400 });

  const db = getServiceClient();

  const { data: waitlist } = await db
    .from('waitlist')
    .select('id, member_id')
    .eq('class_id', classId)
    .order('created_at', { ascending: true });

  if (!waitlist) return NextResponse.json({ position: null });

  const idx = waitlist.findIndex((w) => w.member_id === memberId);
  return NextResponse.json({ position: idx === -1 ? null : idx + 1, total: waitlist.length });
}
