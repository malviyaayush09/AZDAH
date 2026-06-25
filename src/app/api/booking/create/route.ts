export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { sendBookingConfirmed } from '@/lib/whatsapp';

export async function POST(req: NextRequest) {
  // Auth
  const sessionToken = req.cookies.get('session')?.value;
  const session = sessionToken ? await verifySession(sessionToken) : null;
  if (!session || (session as { role: string }).role !== 'member') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { memberId } = session as { memberId: string };

  const { classId } = await req.json();
  if (!classId) return NextResponse.json({ error: 'classId required' }, { status: 400 });

  const db = getServiceClient();

  // Fetch class and member
  const [{ data: cls }, { data: member }] = await Promise.all([
    db.from('classes').select('*').eq('id', classId).single(),
    db.from('members').select('phone, name, plan_end, is_active').eq('id', memberId).single(),
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

  // Check capacity
  const { data: countData } = await db.rpc('class_booking_count', { class_uuid: classId });
  if ((countData || 0) >= cls.capacity) {
    return NextResponse.json({ error: 'Class is full' }, { status: 400 });
  }

  // Check not already booked
  const { data: existing } = await db
    .from('bookings')
    .select('id, status')
    .eq('member_id', memberId)
    .eq('class_id', classId)
    .single();

  if (existing && existing.status === 'confirmed') {
    return NextResponse.json({ error: 'Already booked for this class' }, { status: 400 });
  }

  // Create booking
  const { error } = await db.from('bookings').insert({ member_id: memberId, class_id: classId, status: 'confirmed' });
  if (error) return NextResponse.json({ error: 'Booking failed' }, { status: 500 });

  // WhatsApp confirmation
  const dateStr = new Date(cls.class_date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const timeStr = cls.start_time.slice(0, 5);
  sendBookingConfirmed(member.phone, member.name, cls.title, dateStr, timeStr).catch(console.error);

  return NextResponse.json({ success: true });
}
