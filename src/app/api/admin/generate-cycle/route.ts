export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

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
  type ClassRow = { title: string; trainer_name: string | null; class_date: string; start_time: string; end_time: string; capacity: number; is_cancelled: boolean; category: string | null; instructor_id: string | null };
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
          category: t.category ?? null,
          instructor_id: t.instructor_id ?? null,
        });
      }
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  if (candidates.length === 0) {
    return NextResponse.json({ success: true, created: 0, skipped: 0, message: 'No templates match any day in this range' });
  }

  // Fetch classes that already exist in this date range to avoid duplicates.
  // Cancelled ones must NOT count as duplicates — otherwise once an admin
  // cancels a slot, Generate Cycle can never recreate it ("already existed").
  const { data: existing } = await db
    .from('classes')
    .select('id, class_date, start_time, title, is_cancelled')
    .gte('class_date', startDate)
    .lte('class_date', endDate);

  const keyOf = (c: { class_date: string; start_time: string; title: string }) =>
    `${c.class_date}|${c.start_time}|${c.title}`;

  const activeKeys = new Set<string>();
  const cancelledByKey = new Map<string, string>(); // key -> existing class id
  for (const c of existing || []) {
    const k = keyOf(c);
    if (c.is_cancelled) {
      if (!cancelledByKey.has(k)) cancelledByKey.set(k, c.id);
    } else {
      activeKeys.add(k);
    }
  }

  const toInsert: ClassRow[] = [];
  const toRestore: string[] = [];
  for (const c of candidates) {
    const k = keyOf(c);
    if (activeKeys.has(k)) continue;            // genuine duplicate — skip
    const cancelledId = cancelledByKey.get(k);
    if (cancelledId) {                          // revive rather than duplicate the row
      toRestore.push(cancelledId);
      cancelledByKey.delete(k);
      activeKeys.add(k);
      continue;
    }
    toInsert.push(c);
    activeKeys.add(k);                          // guards against two identical templates in one run
  }
  const skipped = candidates.length - toInsert.length - toRestore.length;

  if (toInsert.length === 0 && toRestore.length === 0) {
    return NextResponse.json({ success: true, created: 0, restored: 0, skipped, message: 'All classes already exist for this period' });
  }

  if (toRestore.length > 0) {
    const { error: resErr } = await db.from('classes').update({ is_cancelled: false }).in('id', toRestore);
    if (resErr) return NextResponse.json({ error: resErr.message }, { status: 500 });
  }

  let created = 0;
  if (toInsert.length > 0) {
    const { data: inserted, error: insErr } = await db.from('classes').insert(toInsert).select('id');
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    created = inserted?.length ?? 0;
  }

  logAudit((session as { phone: string }).phone, 'generate_cycle_run', 'class', undefined, {
    from: startDate, to: endDate, created, restored: toRestore.length, skipped,
  }).catch(() => {});

  return NextResponse.json({ success: true, created, restored: toRestore.length, skipped });
}
