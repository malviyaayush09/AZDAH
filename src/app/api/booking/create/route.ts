export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { sendBookingConfirmed } from '@/lib/whatsapp';
import { checkRateLimit, recordRequest } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  // Auth
  const sessionToken = req.cookies.get('session')?.value;
  const session = sessionToken ? await verifySession(sessionToken) : null;
  if (!session || (session as { role: string }).role !== 'member') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { memberId } = session as { memberId: string };

  // Rate limit: max 10 bookings per member per hour
  const rlKey = `booking:${memberId}`;
  if (await checkRateLimit(rlKey, 10, 60)) {
    return NextResponse.json({ error: 'Too many booking attempts. Try again later.' }, { status: 429 });
  }
  await recordRequest(rlKey);

  const { classId } = await req.json();
  if (!classId) return NextResponse.json({ error: 'classId required' }, { status: 400 });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(classId)) {
    return NextResponse.json({ error: 'Invalid classId' }, { status: 400 });
  }

  const db = getServiceClient();

  // Fetch class and member
  const [{ data: cls }, { data: member }] = await Promise.all([
    db.from('classes').select('*').eq('id', classId).single(),
    db.from('members').select('phone, name, plan_end, plan_start, plan_id, is_active').eq('id', memberId).single(),
  ]);

  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  if (cls.is_cancelled) return NextResponse.json({ error: 'Class is cancelled' }, { status: 400 });
  if (!member || !member.is_active) return NextResponse.json({ error: 'Membership inactive' }, { status: 403 });

  // Check class hasn't already started
  const classDateTime = new Date(`${cls.class_date}T${cls.start_time}`);
  if (classDateTime < new Date()) {
    return NextResponse.json({ error: 'This class has already started.' }, { status: 400 });
  }

  // Check membership not expired
  if (member.plan_end && new Date(member.plan_end) < new Date()) {
    return NextResponse.json({ error: 'Membership expired. Please renew.' }, { status: 403 });
  }

  // Check class pack not exhausted (only if plan has a classes_included limit)
  if (member.plan_id) {
    const { data: planData } = await db
      .from('membership_plans')
      .select('classes_included')
      .eq('id', member.plan_id)
      .single();
    if (planData?.classes_included !== null && planData?.classes_included !== undefined) {
      const { count: usedCount } = await db
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('member_id', memberId)
        .in('status', ['confirmed', 'attended'])
        .gte('created_at', (member.plan_start || '1970-01-01') + 'T00:00:00Z');
      if ((usedCount || 0) >= planData.classes_included) {
        const n = planData.classes_included;
        return NextResponse.json(
          { error: `All ${n} class${n !== 1 ? 'es' : ''} in your pack have been used. Please purchase a new pack to continue.` },
          { status: 400 }
        );
      }
    }
  }

  // Atomic capacity check + insert — prevents race conditions
  const { data: result, error: bookingError } = await db.rpc('book_class_atomic', {
    p_member_id: memberId,
    p_class_id: classId,
  });

  if (bookingError) return NextResponse.json({ error: 'Booking failed' }, { status: 500 });
  if (result === 'class_not_found') return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  if (result === 'class_full') return NextResponse.json({ error: 'Class is full' }, { status: 400 });
  if (result === 'already_booked') return NextResponse.json({ error: 'Already booked for this class' }, { status: 400 });

  // WhatsApp confirmation
  const dateStr = new Date(cls.class_date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const timeStr = cls.start_time.slice(0, 5);
  sendBookingConfirmed(member.phone, member.name, cls.title, dateStr, timeStr).catch(console.error);

  return NextResponse.json({ success: true });
}
