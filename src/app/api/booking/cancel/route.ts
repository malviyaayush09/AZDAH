export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

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

  // Cancel the booking
  await db.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId);

  // Auto-promote first person on waitlist
  const { data: next } = await db
    .from('waitlist')
    .select('id, member_id, members(name, phone)')
    .eq('class_id', booking.class_id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (next) {
    // Upsert booking for waitlisted member
    await db.from('bookings').upsert(
      { member_id: next.member_id, class_id: booking.class_id, status: 'confirmed' },
      { onConflict: 'member_id,class_id' }
    );
    // Remove from waitlist
    await db.from('waitlist').delete().eq('id', next.id);
  }

  return NextResponse.json({ success: true, promoted: !!next });
}
