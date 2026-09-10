export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { promoteFromWaitlist } from '@/lib/waitlist';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  return session && (session as { role: string }).role === 'admin' ? session : null;
}

/**
 * Take one member out of a class.
 *
 * Until now the panel could cancel an entire class, which marks every booking
 * in it cancelled, but it could not remove one person -- so a member who had to
 * come out of a Thursday class had to be talked through cancelling it
 * themselves, and if they were past the notice window they could not.
 *
 * The studio needs both outcomes, and they differ only in whether the class
 * goes back on the member's pack:
 *
 *   restoreCredit: true   -> status 'rescheduled', the class returns
 *   restoreCredit: false  -> status 'cancelled',   the class stays spent
 *
 * Those are the two statuses the credit count already understands -- the same
 * pair the fifteen-minute grace window switches between -- so this adds no new
 * accounting and nothing else has to learn a new word.
 */
export async function POST(req: NextRequest, { params }: { params: { classId: string } }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

  const bookingId = typeof body.bookingId === 'string' ? body.bookingId : '';
  // Deliberately not `!!body.restoreCredit`: a missing or misspelled field would
  // silently take a paid class off someone, which is the expensive direction to
  // be wrong in.
  if (!bookingId || typeof body.restoreCredit !== 'boolean') {
    return NextResponse.json(
      { error: 'bookingId and restoreCredit (true or false) are both required.' },
      { status: 400 },
    );
  }
  const restoreCredit = body.restoreCredit as boolean;

  const db = getServiceClient();

  const { data: booking } = await db
    .from('bookings')
    .select('id, class_id, member_id, status')
    .eq('id', bookingId)
    .eq('class_id', params.classId)
    .single();

  if (!booking) {
    return NextResponse.json({ error: 'That booking is not in this class.' }, { status: 404 });
  }
  if (booking.status !== 'confirmed') {
    return NextResponse.json(
      { error: 'That booking is no longer active, so there is nothing to remove.' },
      { status: 400 },
    );
  }

  const { error } = await db
    .from('bookings')
    .update({ status: restoreCredit ? 'rescheduled' : 'cancelled' })
    .eq('id', bookingId);
  if (error) {
    return NextResponse.json({ error: 'Could not remove them. Please try again.' }, { status: 500 });
  }

  // A seat has come free, so it goes to the front of the queue rather than to
  // whoever refreshes first -- the same helper cancelling and rescheduling use.
  const promoted = await promoteFromWaitlist(db, params.classId, 1).catch(() => []);

  const [{ data: cls }, { data: member }] = await Promise.all([
    db.from('classes').select('title, class_date, start_time').eq('id', params.classId).single(),
    db.from('members').select('name, phone').eq('id', booking.member_id as string).single(),
  ]);

  await logAudit(
    (admin as { phone: string }).phone,
    restoreCredit ? 'booking_removed_credit_returned' : 'booking_removed',
    'booking',
    bookingId,
    {
      member: member?.name?.trim(),
      phone: member?.phone,
      class_title: cls?.title?.trim(),
      class_date: cls?.class_date,
      start_time: cls?.start_time,
      credit_returned: restoreCredit,
      promoted_from_waitlist: promoted.map((p) => p.name),
    },
  ).catch(() => {});

  return NextResponse.json({
    success: true,
    credit_returned: restoreCredit,
    member: member?.name?.trim() ?? null,
    promoted: promoted.map((p) => p.name),
  });
}
