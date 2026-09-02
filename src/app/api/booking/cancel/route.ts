export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { promoteFromWaitlist } from '@/lib/waitlist';
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

  /**
   * A place has come free, so it goes to the front of the waitlist rather than
   * to whoever refreshes first. Shared with the admin capacity change, so both
   * routes apply the same eligibility rules and both charge the promotion to a
   * pack the member actually holds.
   */
  const promoted = await promoteFromWaitlist(db, booking.class_id, 1);

  // credit_returned lets the dashboard say so, rather than the member having
  // to work out whether their class came back.
  return NextResponse.json({ success: true, promoted: promoted.length > 0, credit_returned: withinGrace });
}
