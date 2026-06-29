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

  // Check reschedule eligibility — double-check directly from DB, not just RPC
  const { data: memberData } = await db
    .from('members')
    .select('reschedule_used_this_month')
    .eq('id', memberId)
    .single();
  if (!memberData || memberData.reschedule_used_this_month) {
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

  // Block reschedule if original class already started
  const { data: oldClass } = await db
    .from('classes')
    .select('class_date, start_time')
    .eq('id', oldBooking.class_id)
    .single();
  if (oldClass) {
    const oldClassDateTime = new Date(`${oldClass.class_date}T${oldClass.start_time}`);
    if (oldClassDateTime <= new Date()) {
      return NextResponse.json({ error: 'Cannot reschedule a class that has already started' }, { status: 400 });
    }
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

  // Block reschedule to a class that has already started
  const newClassDateTime = new Date(`${newClass.class_date}T${newClass.start_time}`);
  if (newClassDateTime <= new Date()) {
    return NextResponse.json({ error: 'Cannot reschedule to a class that has already started' }, { status: 400 });
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

  // Execute reschedule sequentially so partial failures can be rolled back
  const r1 = await db.from('bookings').update({ status: 'rescheduled' }).eq('id', oldBookingId);
  if (r1.error) return NextResponse.json({ error: 'Reschedule failed' }, { status: 500 });

  const r2 = await db.from('bookings').insert({ member_id: memberId, class_id: newClassId, status: 'confirmed', rescheduled_from: oldBookingId });
  if (r2.error) {
    await db.from('bookings').update({ status: 'confirmed' }).eq('id', oldBookingId);
    return NextResponse.json({ error: 'Reschedule failed' }, { status: 500 });
  }

  const r3 = await db.from('members').update({ reschedule_used_this_month: true }).eq('id', memberId);
  if (r3.error) {
    await db.from('bookings').update({ status: 'confirmed' }).eq('id', oldBookingId);
    await db.from('bookings').delete().eq('rescheduled_from', oldBookingId).eq('member_id', memberId);
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
