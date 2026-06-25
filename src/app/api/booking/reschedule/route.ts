export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { sendRescheduleConfirmed } from '@/lib/whatsapp';

export async function POST(req: NextRequest) {
  // Auth
  const sessionToken = req.cookies.get('session')?.value;
  const session = sessionToken ? await verifySession(sessionToken) : null;
  if (!session || (session as { role: string }).role !== 'member') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { memberId } = session as { memberId: string };

  const { oldBookingId, newClassId } = await req.json();
  if (!oldBookingId || !newClassId) {
    return NextResponse.json({ error: 'oldBookingId and newClassId required' }, { status: 400 });
  }

  const db = getServiceClient();

  // Check reschedule eligibility (once per month via DB function)
  const { data: canReschedule } = await db.rpc('can_reschedule', { member_uuid: memberId });
  if (!canReschedule) {
    return NextResponse.json({ error: 'You have already rescheduled once this month' }, { status: 400 });
  }

  // Validate old booking belongs to member
  const { data: oldBooking } = await db
    .from('bookings')
    .select('id, class_id, status')
    .eq('id', oldBookingId)
    .eq('member_id', memberId)
    .single();

  if (!oldBooking || oldBooking.status !== 'confirmed') {
    return NextResponse.json({ error: 'Booking not found or already cancelled' }, { status: 404 });
  }

  // Validate new class
  const { data: newClass } = await db
    .from('classes')
    .select('*')
    .eq('id', newClassId)
    .single();

  if (!newClass || newClass.is_cancelled) {
    return NextResponse.json({ error: 'Target class not found or cancelled' }, { status: 404 });
  }

  // Check new class capacity
  const { data: countData } = await db.rpc('class_booking_count', { class_uuid: newClassId });
  if ((countData || 0) >= newClass.capacity) {
    return NextResponse.json({ error: 'Target class is full' }, { status: 400 });
  }

  // Get member details for WhatsApp
  const { data: member } = await db
    .from('members')
    .select('phone, name')
    .eq('id', memberId)
    .single();

  // Execute reschedule in order:
  // 1. Mark old booking as rescheduled
  // 2. Create new booking
  // 3. Mark reschedule_used_this_month = true
  const [r1, r2, r3] = await Promise.all([
    db.from('bookings').update({ status: 'rescheduled' }).eq('id', oldBookingId),
    db.from('bookings').insert({ member_id: memberId, class_id: newClassId, status: 'confirmed', rescheduled_from: oldBookingId }),
    db.from('members').update({ reschedule_used_this_month: true }).eq('id', memberId),
  ]);

  if (r1.error || r2.error || r3.error) {
    return NextResponse.json({ error: 'Reschedule failed' }, { status: 500 });
  }

  // WhatsApp notification
  if (member) {
    const dateStr = new Date(newClass.class_date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeStr = newClass.start_time.slice(0, 5);
    sendRescheduleConfirmed(member.phone, member.name, newClass.title, dateStr, timeStr).catch(console.error);
  }

  return NextResponse.json({ success: true });
}
