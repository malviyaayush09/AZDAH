export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { pickPackForClass } from '@/lib/pack';
import { verifySession } from '@/lib/auth';
import { sendWaitlistPromoted } from '@/lib/whatsapp';
import { isPastNoticeWindow, NOTICE_HOURS } from '@/lib/date';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  if (!session || (session as { role: string }).role !== 'member') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { memberId } = session as { memberId: string };

  const { bookingId } = await req.json();
  if (!bookingId) return NextResponse.json({ error: 'bookingId required' }, { status: 400 });

  const db = getServiceClient();

  // Verify booking belongs to this member
  const { data: booking } = await db
    .from('bookings')
    .select('id, class_id, status, created_at')
    .eq('id', bookingId)
    .eq('member_id', memberId)
    .single();

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  if (booking.status !== 'confirmed') return NextResponse.json({ error: 'Booking is not active' }, { status: 400 });

  /**
   * Undoing a booking you just made is a correction, not a cancellation.
   *
   * A cancelled booking keeps consuming its credit on purpose, so that
   * cancel-and-rebook cannot be used as unlimited rescheduling. But four
   * members lost a class each by tapping the wrong time slot and fixing it
   * within a minute, which is not what that rule is for.
   *
   * Inside the grace window the booking is marked 'rescheduled' instead --
   * the status the credit count already ignores -- and the notice window is
   * waived too, since somebody who booked ninety seconds ago has not had the
   * chance to hold a seat off anyone.
   */
  const GRACE_MINUTES = 15;
  const bookedAgoMs = Date.now() - new Date(booking.created_at as string).getTime();
  const withinGrace = bookedAgoMs < GRACE_MINUTES * 60_000;

  const { data: cls } = await db
    .from('classes')
    .select('class_date, start_time, category')
    .eq('id', booking.class_id)
    .single();
  if (!withinGrace && cls && isPastNoticeWindow(cls.class_date, cls.start_time)) {
    return NextResponse.json(
      { error: `Cancellations need at least ${NOTICE_HOURS} hours' notice before the class starts.` },
      { status: 400 }
    );
  }

  await db.from('bookings')
    .update({ status: withinGrace ? 'rescheduled' : 'cancelled' })
    .eq('id', bookingId);

  // Auto-promote the first ELIGIBLE person on the waitlist. Promotion used to
  // book whoever was first with no checks at all, so an expired, deactivated or
  // pack-exhausted member could be handed a free class. Walk the queue in order
  // and skip anyone who could not have booked this class themselves.
  const { data: queue } = await db
    .from('waitlist')
    .select('id, member_id, members(name, phone, is_active, is_frozen, plan_end, plan_start, plan_id)')
    .eq('class_id', booking.class_id)
    .order('created_at', { ascending: true });

  type WaitMember = { name: string; phone: string; is_active: boolean; is_frozen: boolean | null; plan_end: string | null; plan_start: string | null; plan_id: string | null };
  let next: { id: string; member_id: string; members: WaitMember } | null = null;

  for (const entry of queue || []) {
    const raw = entry.members;
    const m = (Array.isArray(raw) ? raw[0] : raw) as WaitMember | null;
    if (!m || !m.is_active || m.is_frozen) continue;
    // Promote only into a class this member could have booked themselves:
    // some pack of theirs must cover the category and still hold a credit.
    // Judged per pack — members.plan_end only names the primary one.
    const { pack: payer } = await pickPackForClass(db, entry.member_id, cls?.category ?? null, cls?.class_date);
    if (!payer) continue;

    next = { id: entry.id, member_id: entry.member_id, members: m };
    break;
  }

  if (next) {
    await db.from('bookings').upsert(
      { member_id: next.member_id, class_id: booking.class_id, status: 'confirmed' },
      { onConflict: 'member_id,class_id' }
    );
    await db.from('waitlist').delete().eq('id', next.id);

    // Notify promoted member via WhatsApp
    if (cls) {
      const member = next.members;
      // Re-fetch class title since we only selected class_date/start_time above
      const { data: fullCls } = await db.from('classes').select('title').eq('id', booking.class_id).single();
      if (fullCls) {
        sendWaitlistPromoted(member.phone, member.name, fullCls.title, cls.class_date, cls.start_time)
          .catch((e) => console.error('Waitlist promotion WA failed:', e));
      }
    }
  }

  // credit_returned lets the dashboard say so, rather than the member having
  // to work out whether their class came back.
  return NextResponse.json({ success: true, promoted: !!next, credit_returned: withinGrace });
}
