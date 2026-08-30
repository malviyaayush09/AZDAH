export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  return session && (session as { role: string }).role === 'admin' ? session : null;
}

export async function POST(req: NextRequest, { params }: { params: { classId: string } }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getServiceClient();
  const { error } = await db.from('classes').update({ is_cancelled: true }).eq('id', params.classId);
  if (error) return NextResponse.json({ error: 'Failed to cancel class' }, { status: 500 });

  // Release everyone who had booked it. Pack usage is counted as bookings still
  // in 'confirmed', so leaving these would burn a class credit for a session
  // that never ran.
  const { data: released } = await db
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('class_id', params.classId)
    .eq('status', 'confirmed')
    .select('id');

  // Nobody can be promoted into a cancelled class.
  await db.from('waitlist').delete().eq('class_id', params.classId);

  await logAudit((admin as { phone: string }).phone, 'class_cancelled', 'class', params.classId, {
    bookings_released: released?.length ?? 0,
  }).catch(() => {});

  return NextResponse.json({ success: true, released: released?.length ?? 0 });
}
