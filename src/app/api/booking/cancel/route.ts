export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { sendWaitlistPromoted } from '@/lib/whatsapp';

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
  if (cls) {
    const classDateTime = new Date(`${cls.class_date}T${cls.start_time}`);
    if (classDateTime <= new Date()) {
      return NextResponse.json({ error: 'Cannot cancel a class that has already started' }, { status: 400 });
    }
  }

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
    await db.from('bookings').upsert(
      { member_id: next.member_id, class_id: booking.class_id, status: 'confirmed' },
      { onConflict: 'member_id,class_id' }
    );
    await db.from('waitlist').delete().eq('id', next.id);

    // Notify promoted member via WhatsApp
    if (cls) {
      const memberRaw = next.members;
      const member = (Array.isArray(memberRaw) ? memberRaw[0] : memberRaw) as { name: string; phone: string } | null;
      // Re-fetch class title since we only selected class_date/start_time above
      const { data: fullCls } = await db.from('classes').select('title').eq('id', booking.class_id).single();
      if (member && fullCls) {
        sendWaitlistPromoted(member.phone, member.name, fullCls.title, cls.class_date, cls.start_time)
          .catch((e) => console.error('Waitlist promotion WA failed:', e));
      }
    }
  }

  return NextResponse.json({ success: true, promoted: !!next });
}
