export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { pickPackForClass, countUsedInPack } from '@/lib/pack';
import { verifySession } from '@/lib/auth';
import { sendBookingConfirmed } from '@/lib/whatsapp';
import { checkRateLimit, recordRequest } from '@/lib/rate-limit';
import { classHasStarted } from '@/lib/date';

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
    db.from('members').select('phone, name, plan_end, plan_start, plan_id, is_active, is_frozen').eq('id', memberId).single(),
  ]);

  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  if (cls.is_cancelled) return NextResponse.json({ error: 'Class is cancelled' }, { status: 400 });
  if (!member || !member.is_active) return NextResponse.json({ error: 'Membership inactive' }, { status: 403 });

  // A frozen membership is paused — freezing set the flag but nothing enforced
  // it, so frozen members could still book.
  if (member.is_frozen) {
    return NextResponse.json({ error: 'Your membership is currently frozen. Please contact the studio to resume it.' }, { status: 403 });
  }

  // Check class hasn't already started (IST wall-clock — see lib/date.ts)
  if (classHasStarted(cls.class_date, cls.start_time)) {
    return NextResponse.json({ error: 'This class has already started.' }, { status: 400 });
  }

  // Which pack pays for this class? A member may hold several at once, so the
  // answer is the one expiring soonest that covers this category and still has
  // a credit. Expiry is judged per pack, not from members.plan_end, because
  // that column only names the primary pack.
  const { pack, reason } = await pickPackForClass(db, memberId, cls.category ?? null);

  if (!pack) {
    if (reason === 'not_covered') {
      return NextResponse.json(
        { error: 'This class is not included in your pack. Please check the classes your pack covers.' },
        { status: 403 }
      );
    }
    if (reason === 'exhausted') {
      return NextResponse.json(
        { error: 'You have used every class in your packs. Please purchase another pack to continue.' },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: 'Membership expired. Please renew.' }, { status: 403 });
  }

  const packLimit: number | null = pack.classes_included;

  // Atomic capacity check + insert — prevents race conditions
  const { data: result, error: bookingError } = await db.rpc('book_class_atomic', {
    p_member_id: memberId,
    p_class_id: classId,
  });

  if (bookingError) return NextResponse.json({ error: 'Booking failed' }, { status: 500 });
  if (result === 'class_not_found') return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  if (result === 'class_full') return NextResponse.json({ error: 'Class is full' }, { status: 400 });
  if (result === 'already_booked') return NextResponse.json({ error: 'Already booked for this class' }, { status: 400 });

  // book_class_atomic does not know about packs, so charge the booking to the
  // chosen pack immediately. Until this lands the row counts against nothing,
  // which is why the re-check below reads the pack rather than the member.
  await db.from('bookings')
    .update({ pack_id: pack.id })
    .eq('member_id', memberId)
    .eq('class_id', classId)
    .eq('status', 'confirmed')
    .is('pack_id', null);

  // The pack check above is check-then-insert: two simultaneous requests can
  // both pass it and overshoot the pack. Re-count now that the row exists and
  // undo this booking if it turned out to be one too many. (The capacity race
  // is already handled inside book_class_atomic; the pack limit is not.)
  if (packLimit !== null) {
    const usedNow = await countUsedInPack(db, pack.id);
    if (usedNow > packLimit) {
      // Delete rather than mark cancelled. A cancelled booking now consumes a
      // pack credit, and this booking lost a race — the member never had it.
      await db.from('bookings')
        .delete()
        .eq('member_id', memberId)
        .eq('class_id', classId)
        .eq('status', 'confirmed');
      return NextResponse.json(
        { error: `All ${packLimit} class${packLimit !== 1 ? 'es' : ''} in that pack have been used. Please purchase another pack to continue.` },
        { status: 400 }
      );
    }
  }

  // WhatsApp confirmation
  const dateStr = new Date(cls.class_date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const timeStr = cls.start_time.slice(0, 5);
  sendBookingConfirmed(member.phone, member.name, cls.title, dateStr, timeStr).catch(console.error);

  return NextResponse.json({ success: true });
}
