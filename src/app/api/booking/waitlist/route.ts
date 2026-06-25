export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

async function auth(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  if (!session || (session as { role: string }).role !== 'member') return null;
  return session as { memberId: string };
}

// POST /api/booking/waitlist — join waitlist
export async function POST(req: NextRequest) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { classId } = await req.json();
  if (!classId) return NextResponse.json({ error: 'classId required' }, { status: 400 });

  const db = getServiceClient();

  // Verify class exists and is actually full
  const [{ data: cls }, { data: count }] = await Promise.all([
    db.from('classes').select('id, capacity, is_cancelled').eq('id', classId).single(),
    db.rpc('class_booking_count', { class_uuid: classId }),
  ]);

  if (!cls || cls.is_cancelled) return NextResponse.json({ error: 'Class not available' }, { status: 400 });
  if ((count || 0) < cls.capacity) return NextResponse.json({ error: 'Class has spots available — book directly' }, { status: 400 });

  // Check not already booked
  const { data: existing } = await db
    .from('bookings').select('id').eq('member_id', session.memberId).eq('class_id', classId).eq('status', 'confirmed').single();
  if (existing) return NextResponse.json({ error: 'Already booked' }, { status: 400 });

  // Add to waitlist (ignore duplicate)
  const { error } = await db.from('waitlist').upsert(
    { member_id: session.memberId, class_id: classId },
    { onConflict: 'member_id,class_id' }
  );
  if (error) return NextResponse.json({ error: 'Failed to join waitlist' }, { status: 500 });

  // Return position
  const { count: pos } = await db.from('waitlist').select('*', { count: 'exact', head: true }).eq('class_id', classId);
  return NextResponse.json({ success: true, position: pos });
}

// DELETE /api/booking/waitlist — leave waitlist
export async function DELETE(req: NextRequest) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { classId } = await req.json();
  if (!classId) return NextResponse.json({ error: 'classId required' }, { status: 400 });

  const db = getServiceClient();
  await db.from('waitlist').delete().eq('member_id', session.memberId).eq('class_id', classId);

  return NextResponse.json({ success: true });
}
