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

  // Which class categories does this member's pack grant access to?
  const { data: member } = await db
    .from('members')
    .select('membership_plans(allowed_categories)')
    .eq('id', memberId)
    .single();
  const plansRaw = member?.membership_plans;
  const planInfo = (Array.isArray(plansRaw) ? plansRaw[0] : plansRaw) as { allowed_categories: string[] | null } | null;
  const allowed = planInfo?.allowed_categories ?? null;

  // Upcoming classes — restricted to the categories the member paid for.
  let classQuery = db
    .from('classes')
    .select('id, title, trainer_name, class_date, start_time, end_time, capacity, category')
    .eq('is_cancelled', false)
    .gte('class_date', today)
    .order('class_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(60);
  if (allowed && allowed.length) classQuery = classQuery.in('category', allowed);

  const [classRes, bookingRes, waitlistRes] = await Promise.all([
    classQuery,
    db.from('bookings').select('id, class_id, status').eq('member_id', memberId).eq('status', 'confirmed'),
    db.from('waitlist').select('class_id').eq('member_id', memberId),
  ]);

  const bookingMap = new Map((bookingRes.data || []).map((b) => [b.class_id, { id: b.id, status: b.status }]));
  const waitlistSet = new Set((waitlistRes.data || []).map((w) => w.class_id));

  // Booking counts stay server-side — members only ever see a binary "full".
  const classIds = (classRes.data || []).map((c) => c.id);
  const countRes = await Promise.all(classIds.map((id) => db.rpc('class_booking_count', { class_uuid: id })));
  const countMap = new Map(classIds.map((id, i) => [id, (countRes[i].data as number) || 0]));

  const upcoming = (classRes.data || []).map((cls) => {
    const booking = bookingMap.get(cls.id);
    const bookedCount = (countMap.get(cls.id) as number) || 0;
    return {
      id: cls.id,
      title: cls.title,
      trainer_name: cls.trainer_name,
      class_date: cls.class_date,
      start_time: cls.start_time,
      end_time: cls.end_time,
      is_full: bookedCount >= cls.capacity,
      my_booking_id: booking?.id || null,
      my_booking_status: booking?.status || null,
      on_waitlist: waitlistSet.has(cls.id),
    };
  });

  const myBookings = upcoming.filter((c) => c.my_booking_status === 'confirmed');

  return NextResponse.json({ upcoming, myBookings });
}
