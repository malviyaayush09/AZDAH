export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { sendRescheduleConfirmed } from '@/lib/whatsapp';
import { classHasStarted, isPastNoticeWindow, NOTICE_HOURS } from '@/lib/date';
import { pickPackForClass, packCoversCategory, getSpendablePacks } from '@/lib/pack';

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
    .select('reschedule_used_this_month, is_active, is_frozen, plan_end, plan_id')
    .eq('id', memberId)
    .single();
  if (!memberData || memberData.reschedule_used_this_month) {
    return NextResponse.json({ error: 'You have already rescheduled once this month' }, { status: 400 });
  }

  // Reschedule previously checked only timing and capacity, so it was a way
  // around every membership rule that booking/create enforces.
  if (!memberData.is_active) {
    return NextResponse.json({ error: 'Membership inactive' }, { status: 403 });
  }
  if (memberData.is_frozen) {
    return NextResponse.json({ error: 'Your membership is currently frozen. Please contact the studio to resume it.' }, { status: 403 });
  }
  if (memberData.plan_end && new Date(memberData.plan_end) < new Date()) {
    return NextResponse.json({ error: 'Membership expired. Please renew.' }, { status: 403 });
  }

  // Validate old booking belongs to member
  const { data: oldBooking } = await db
    .from('bookings')
    .select('id, class_id, status, pack_id')
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
  if (oldClass && isPastNoticeWindow(oldClass.class_date, oldClass.start_time)) {
    return NextResponse.json(
      { error: `Reschedules need at least ${NOTICE_HOURS} hours' notice before the class starts.` },
      { status: 400 }
    );
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
  if (classHasStarted(newClass.class_date, newClass.start_time)) {
    return NextResponse.json({ error: 'Cannot reschedule to a class that has already started' }, { status: 400 });
  }

  // Tier gate — the target class must be one the member's pack covers.
  // Without this, someone on a cheaper pack could book a class they ARE
  // entitled to and then reschedule into a premium one.
  if (memberData.plan_id) {
    const { data: planData } = await db
      .from('membership_plans')
      .select('allowed_categories')
      .eq('id', memberData.plan_id)
      .single();
    if (planData?.allowed_categories && planData.allowed_categories.length && newClass.category
        && !planData.allowed_categories.includes(newClass.category)) {
      return NextResponse.json(
        { error: 'That class is not included in your pack. Please pick one your pack covers.' },
        { status: 403 }
      );
    }
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

  /**
   * Which pack pays for the replacement.
   *
   * The new booking used to be written with no pack_id at all. Usage is counted
   * as "bookings whose pack_id is this pack", so the old booking stopped
   * counting the moment it became 'rescheduled' and the new one never started
   * — every reschedule quietly handed the member a free class. Nobody had hit
   * it only because the feature was barely used.
   *
   * Prefer the pack that paid for the original booking, so a reschedule stays
   * on the same pack and remains net-zero. Fall back to the ordinary selection
   * when that pack cannot cover the new class or is no longer spendable.
   */
  let newPackId: string | null = null;
  if (oldBooking?.pack_id) {
    const spendable = await getSpendablePacks(db, memberId, newClass.class_date);
    const same = spendable.find((p) => p.id === oldBooking.pack_id);
    if (same && packCoversCategory(same, newClass.category ?? null)) newPackId = same.id;
  }
  if (!newPackId) {
    const { pack } = await pickPackForClass(db, memberId, newClass.category ?? null, newClass.class_date);
    newPackId = pack?.id ?? null;
  }
  if (!newPackId) {
    return NextResponse.json(
      { error: 'No pack of yours covers that class. Please pick one your pack includes.' },
      { status: 403 },
    );
  }

  // Execute reschedule sequentially so partial failures can be rolled back
  const r1 = await db.from('bookings').update({ status: 'rescheduled' }).eq('id', oldBookingId);
  if (r1.error) return NextResponse.json({ error: 'Reschedule failed' }, { status: 500 });

  /**
   * Upsert, not insert. (member_id, class_id) is unique and a cancelled or
   * rescheduled booking keeps its row, so moving into a class the member has
   * ever held before collided with that row and returned a bare
   * "Reschedule failed" with nothing the member could act on.
   */
  const r2 = await db.from('bookings').upsert(
    { member_id: memberId, class_id: newClassId, status: 'confirmed', rescheduled_from: oldBookingId, pack_id: newPackId },
    { onConflict: 'member_id,class_id' },
  );
  if (r2.error) {
    await db.from('bookings').update({ status: 'confirmed' }).eq('id', oldBookingId);
    return NextResponse.json({ error: `Could not move your booking: ${r2.error.message}` }, { status: 500 });
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
