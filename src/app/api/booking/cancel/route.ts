export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { sendWaitlistPromoted } from '@/lib/whatsapp';
import { classHasStarted } from '@/lib/date';

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
    .select('id, class_id, status')
    .eq('id', bookingId)
    .eq('member_id', memberId)
    .single();

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  if (booking.status !== 'confirmed') return NextResponse.json({ error: 'Booking is not active' }, { status: 400 });

  // Block cancel if class has already started
  const { data: cls } = await db
    .from('classes')
    .select('class_date, start_time')
    .eq('id', booking.class_id)
    .single();
  if (cls && classHasStarted(cls.class_date, cls.start_time)) {
    return NextResponse.json({ error: 'Cannot cancel a class that has already started' }, { status: 400 });
  }

  // Cancel the booking
  await db.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId);

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
    if (m.plan_end && new Date(m.plan_end) < new Date()) continue;

    if (m.plan_id) {
      const { data: planData } = await db
        .from('membership_plans')
        .select('classes_included')
        .eq('id', m.plan_id)
        .single();
      if (planData?.classes_included !== null && planData?.classes_included !== undefined) {
        const { count: usedCount } = await db
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .eq('member_id', entry.member_id)
          .eq('status', 'confirmed')
          .gte('created_at', (m.plan_start || '1970-01-01') + 'T00:00:00Z');
        if ((usedCount || 0) >= planData.classes_included) continue; // pack exhausted
      }
    }

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

  return NextResponse.json({ success: true, promoted: !!next });
}
