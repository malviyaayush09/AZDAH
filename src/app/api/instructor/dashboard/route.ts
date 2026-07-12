export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  if (!session || (session as { role: string }).role !== 'instructor') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { instructorId } = session as { instructorId: string };

  const db = getServiceClient();

  const { data: instructor } = await db.from('instructors').select('name').eq('id', instructorId).single();

  // Their classes from the last 2 weeks onward (recent past kept for attendance).
  const from = new Date();
  from.setDate(from.getDate() - 14);
  const fromStr = from.toISOString().split('T')[0];
  const todayStr = new Date().toISOString().split('T')[0];

  const { data: classes } = await db
    .from('classes')
    .select('id, title, class_date, start_time, end_time, capacity, is_cancelled')
    .eq('instructor_id', instructorId)
    .eq('is_cancelled', false)
    .gte('class_date', fromStr)
    .order('class_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(100);

  const ids = (classes || []).map((c) => c.id);
  const counts = await Promise.all(ids.map((id) => db.rpc('class_booking_count', { class_uuid: id })));
  const countMap = new Map(ids.map((id, i) => [id, (counts[i].data as number) || 0]));

  const withCounts = (classes || []).map((c) => ({
    ...c,
    booked_count: countMap.get(c.id) || 0,
    is_past: c.class_date < todayStr,
  }));

  const upcoming = withCounts.filter((c) => !c.is_past);
  const stats = {
    upcoming_classes: upcoming.length,
    total_upcoming_bookings: upcoming.reduce((s, c) => s + c.booked_count, 0),
  };

  return NextResponse.json({ name: instructor?.name || 'Instructor', classes: withCounts, stats });
}
