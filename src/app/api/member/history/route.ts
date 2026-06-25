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
  const today = new Date().toISOString().split('T')[0];

  // Get all bookings for this member
  const { data: bookings } = await db
    .from('bookings')
    .select('id, status, attended, class_id, created_at')
    .eq('member_id', memberId)
    .in('status', ['confirmed', 'cancelled', 'rescheduled']);

  if (!bookings?.length) return NextResponse.json({ history: [] });

  const classIds = bookings.map(b => b.class_id);

  // Get past classes only
  const { data: classes } = await db
    .from('classes')
    .select('id, title, trainer_name, class_date, start_time, end_time')
    .in('id', classIds)
    .lt('class_date', today)
    .order('class_date', { ascending: false });

  if (!classes?.length) return NextResponse.json({ history: [] });

  const classMap = new Map(classes.map(c => [c.id, c]));

  const history = bookings
    .map(b => {
      const cls = classMap.get(b.class_id);
      if (!cls) return null;
      return { booking_id: b.id, status: b.status, attended: b.attended, ...cls };
    })
    .filter(Boolean)
    .sort((a, b) => (b!.class_date + b!.start_time).localeCompare(a!.class_date + a!.start_time));

  return NextResponse.json({ history });
}
