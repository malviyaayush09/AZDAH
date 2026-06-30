export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await verifySession(req.cookies.get('session')?.value || '');
  if (!session || (session as { role: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { startDate, endDate } = await req.json();
  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate and endDate required' }, { status: 400 });
  }

  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: 'Invalid date format — use YYYY-MM-DD' }, { status: 400 });
  }
  if (end < start) {
    return NextResponse.json({ error: 'endDate must be on or after startDate' }, { status: 400 });
  }
  const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 60) {
    return NextResponse.json({ error: 'Date range cannot exceed 60 days' }, { status: 400 });
  }

  const db = getServiceClient();

  // Load active templates
  const { data: templates, error: tErr } = await db
    .from('class_templates')
    .select('*')
    .eq('is_active', true);
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (!templates || templates.length === 0) {
    return NextResponse.json({ error: 'No active templates found. Add templates first.' }, { status: 400 });
  }

  // Build candidate classes for each day in range
  type ClassRow = { title: string; trainer_name: string | null; class_date: string; start_time: string; end_time: string; capacity: number; is_cancelled: boolean };
  const candidates: ClassRow[] = [];
  const current = new Date(start);
  while (current <= end) {
    const dow = current.getUTCDay();
    const dateStr = current.toISOString().split('T')[0];
    for (const t of templates) {
      if (t.day_of_week === dow) {
        candidates.push({
          title: t.title,
          trainer_name: t.instructor_name ?? null,
          class_date: dateStr,
          start_time: t.start_time,
          end_time: t.end_time,
          capacity: t.capacity,
          is_cancelled: false,
        });
      }
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  if (candidates.length === 0) {
    return NextResponse.json({ success: true, created: 0, skipped: 0, message: 'No templates match any day in this range' });
  }

  // Fetch classes that already exist in this date range to avoid duplicates
  const { data: existing } = await db
    .from('classes')
    .select('class_date, start_time, title')
    .gte('class_date', startDate)
    .lte('class_date', endDate);

  const existingKeys = new Set((existing || []).map(c => `${c.class_date}|${c.start_time}|${c.title}`));
  const toInsert = candidates.filter(c => !existingKeys.has(`${c.class_date}|${c.start_time}|${c.title}`));
  const skipped = candidates.length - toInsert.length;

  if (toInsert.length === 0) {
    return NextResponse.json({ success: true, created: 0, skipped, message: 'All classes already exist for this period' });
  }

  const { data: inserted, error: insErr } = await db.from('classes').insert(toInsert).select('id');
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ success: true, created: inserted?.length ?? 0, skipped });
}
