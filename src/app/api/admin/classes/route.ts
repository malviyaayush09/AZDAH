export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  return session && (session as { role: string }).role === 'admin'
    ? (session as { phone: string })
    : null;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getServiceClient();
  const today = new Date().toISOString().split('T')[0];

  const { data: classes } = await db
    .from('classes')
    .select('id, title, trainer_name, class_date, start_time, end_time, capacity, is_cancelled')
    .gte('class_date', today)
    .order('class_date', { ascending: true })
    .order('start_time', { ascending: true });

  // Fetch booking counts
  const enriched = await Promise.all(
    (classes || []).map(async (cls) => {
      const { data: count } = await db.rpc('class_booking_count', { class_uuid: cls.id });
      return { ...cls, booked_count: count || 0 };
    })
  );

  return NextResponse.json({ classes: enriched });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, trainer_name, class_date, start_time, end_time, capacity } = await req.json();

  if (!title || !class_date || !start_time || !end_time || !capacity) {
    return NextResponse.json({ error: 'All fields except trainer are required' }, { status: 400 });
  }

  const db = getServiceClient();
  const { error } = await db.from('classes').insert({
    title,
    trainer_name: trainer_name || null,
    class_date,
    start_time,
    end_time,
    capacity: parseInt(capacity),
  });

  if (error) return NextResponse.json({ error: 'Failed to create class' }, { status: 500 });
  logAudit(admin.phone, 'class_created', 'class', undefined, { title, class_date, start_time }).catch(() => {});
  return NextResponse.json({ success: true });
}
