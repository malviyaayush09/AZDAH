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

// POST /api/admin/classes/[classId]/duplicate — copy class to same day next week
export async function POST(
  req: NextRequest,
  { params }: { params: { classId: string } }
) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getServiceClient();
  const { data: cls } = await db
    .from('classes')
    .select('title, trainer_name, class_date, start_time, end_time, capacity')
    .eq('id', params.classId)
    .single();

  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

  // Advance date by 7 days
  const nextDate = new Date(cls.class_date + 'T00:00:00');
  nextDate.setDate(nextDate.getDate() + 7);
  const nextDateStr = nextDate.toISOString().split('T')[0];

  const { data: newCls, error } = await db.from('classes').insert({
    title: cls.title,
    trainer_name: cls.trainer_name,
    class_date: nextDateStr,
    start_time: cls.start_time,
    end_time: cls.end_time,
    capacity: cls.capacity,
  }).select('id').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, newClassId: newCls.id, newDate: nextDateStr });
}
