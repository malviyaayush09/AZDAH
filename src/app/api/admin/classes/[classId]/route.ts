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
 * Change a class that is already published.
 *
 * Until now nothing could edit a live class -- the panel could create, duplicate,
 * cancel and mark attendance, and that was all. So "can I add one more spot to
 * Thursday?" had no answer except cancelling the class and rebuilding it, which
 * throws away everyone's bookings.
 *
 * Capacity only, deliberately. Changing a published class's date, time or
 * discipline silently rewrites what members have already booked and what their
 * credits were spent on, which is the same trap that locked a member out of
 * booking last week. Those need their own flow with the bookings in view.
 */
export async function PATCH(req: NextRequest, { params }: { params: { classId: string } }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

  const capacity = Number(body.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
    return NextResponse.json({ error: 'Capacity must be a whole number between 1 and 100.' }, { status: 400 });
  }

  const db = getServiceClient();

  const { data: cls } = await db
    .from('classes')
    .select('id, title, class_date, capacity, is_cancelled')
    .eq('id', params.classId)
    .single();
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  if (cls.is_cancelled) {
    return NextResponse.json({ error: 'This class is cancelled. Restore it before changing the size.' }, { status: 400 });
  }

  // Never below the people already in the room. Silently shrinking past the
  // bookings would leave the class over its own capacity with no way to tell
  // which booking is the surplus one.
  const { count: booked } = await db
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('class_id', params.classId)
    .eq('status', 'confirmed');
  const taken = booked ?? 0;

  if (capacity < taken) {
    return NextResponse.json(
      { error: `${taken} ${taken === 1 ? 'person is' : 'people are'} already booked, so the size cannot go below ${taken}. Cancel a booking first if you need to.` },
      { status: 400 },
    );
  }

  if (capacity === cls.capacity) {
    return NextResponse.json({ success: true, capacity, promoted: [], unchanged: true });
  }

  const { error } = await db.from('classes').update({ capacity }).eq('id', params.classId);
  if (error) return NextResponse.json({ error: 'Could not change the class size. Please try again.' }, { status: 500 });

  /**
   * A seat opened up, so it belongs to whoever has been waiting -- not to
   * whichever member happens to refresh first. Bounded by the seats actually
   * created, and each promotion is charged to a pack the member holds.
   */
  const newSeats = capacity - taken;
  const promoted = capacity > cls.capacity ? await promoteFromWaitlist(db, params.classId, newSeats) : [];

  await logAudit((admin as { phone: string }).phone, 'class_capacity_changed', 'class', params.classId, {
    title: cls.title?.trim(),
    class_date: cls.class_date,
    from: cls.capacity,
    to: capacity,
    booked: taken,
    promoted_from_waitlist: promoted.map((p) => p.name),
  }).catch(() => {});

  return NextResponse.json({ success: true, capacity, booked: taken, promoted });
}
