export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  if (!session || (session as { role: string }).role !== 'admin') return null;
  return session;
}

// PATCH /api/admin/classes/[classId]/attendance — mark booking as attended/not
export async function PATCH(req: NextRequest) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { bookingId, attended } = await req.json();
  if (!bookingId || attended === undefined) {
    return NextResponse.json({ error: 'bookingId and attended required' }, { status: 400 });
  }

  const db = getServiceClient();
  const { error } = await db.from('bookings').update({ attended }).eq('id', bookingId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
