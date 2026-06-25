export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const sessionToken = req.cookies.get('session')?.value;
  const session = sessionToken ? await verifySession(sessionToken) : null;
  if (!session || (session as { role: string }).role !== 'member') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { memberId } = session as { memberId: string };

  const db = getServiceClient();
  const today = new Date().toISOString().split('T')[0];

  // Fetch upcoming classes + member's bookings in parallel
  const [classRes, bookingRes, waitlistRes] = await Promise.all([
    db
      .from('classes')
      .select('id, title, trainer_name, class_date, start_time, end_time, capacity')
      .eq('is_cancelled', false)
      .gte('class_date', today)
      .order('class_date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(30),
    db
      .from('bookings')
      .select('id, class_id, status')
      .eq('member_id', memberId)
      .eq('status', 'confirmed'),
    db
      .from('waitlist')
      .select('class_id')
      .eq('member_id', memberId),
  ]);

  const bookingMap = new Map((bookingRes.data || []).map((b) => [b.class_id, { id: b.id, status: b.status }]));
  const waitlistSet = new Set((waitlistRes.data || []).map((w) => w.class_id));

  // Fetch booking counts for all classes
  const classIds = (classRes.data || []).map((c) => c.id);
  const countRes = await Promise.all(
    classIds.map((id) => db.rpc('class_booking_count', { class_uuid: id }))
  );
  const countMap = new Map(classIds.map((id, i) => [id, countRes[i].data || 0]));

  const upcoming = (classRes.data || []).map((cls) => {
    const booking = bookingMap.get(cls.id);
    return {
      ...cls,
      booked_count: countMap.get(cls.id) || 0,
      my_booking_id: booking?.id || null,
      my_booking_status: booking?.status || null,
      on_waitlist: waitlistSet.has(cls.id),
    };
  });

  const myBookings = upcoming.filter((c) => c.my_booking_status === 'confirmed');

  return NextResponse.json({ upcoming, myBookings });
}
