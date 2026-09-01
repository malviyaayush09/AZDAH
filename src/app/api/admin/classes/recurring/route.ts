export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { todayIST } from '@/lib/date';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  return session && (session as { role: string }).role === 'admin' ? session : null;
}

// Day-of-week numbers: 0=Sun, 1=Mon, ..., 6=Sat
// Dates here are UTC-anchored calendar days (see todayIST use below), so all
// arithmetic must use the UTC accessors to stay on the same day.
function nextOccurrence(fromDate: Date, targetDow: number): Date {
  const d = new Date(fromDate);
  const delta = (targetDow - d.getUTCDay() + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await req.json().catch(() => null);
  if (!parsed) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const { title, trainer_name, days_of_week, start_time, end_time, capacity, weeks, category, instructor_id } =
    parsed as {
      title: string;
      trainer_name?: string;
      days_of_week: number[]; // 0-6
      start_time: string;
      end_time: string;
      capacity: number;
      weeks: number; // how many weeks to generate (1–12)
      category?: string;
      instructor_id?: string;
    };

  if (!title || !days_of_week?.length || !start_time || !end_time || !capacity || !weeks) {
    return NextResponse.json({ error: 'All fields required' }, { status: 400 });
  }
  if (weeks < 1 || weeks > 12) {
    return NextResponse.json({ error: 'Weeks must be 1–12' }, { status: 400 });
  }
  if (!days_of_week.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    return NextResponse.json({ error: 'Invalid day of week' }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}/.test(String(start_time)) || !/^\d{2}:\d{2}/.test(String(end_time))) {
    return NextResponse.json({ error: 'Invalid time' }, { status: 400 });
  }
  if (String(end_time).slice(0, 5) <= String(start_time).slice(0, 5)) {
    return NextResponse.json({ error: 'End time must be after the start time' }, { status: 400 });
  }
  const cap = parseInt(String(capacity), 10);
  if (!Number.isFinite(cap) || cap < 1 || cap > 200) {
    return NextResponse.json({ error: 'Capacity must be between 1 and 200' }, { status: 400 });
  }

  // Anchor to the studio's calendar day. Using the server's UTC "today" meant
  // that before 05:30 IST the whole series was generated from the wrong day.
  const [ty, tm, td] = todayIST().split('-').map(Number);
  const today = new Date(Date.UTC(ty, tm - 1, td));

  // A class with no discipline is filtered out of every member's calendar,
  // because members only see the disciplines their pack covers. It still shows
  // publicly, so the studio advertises a class nobody can book and reads the
  // empty register as a lack of interest. Refuse it rather than create it.
  if (!category) {
    return NextResponse.json(
      { error: 'Pick a class type. Without one, members cannot see or book this class.' },
      { status: 400 },
    );
  }

  const classes: { title: string; trainer_name: string | null; class_date: string; start_time: string; end_time: string; capacity: number; category: string | null; instructor_id: string | null }[] = [];

  for (let w = 0; w < weeks; w++) {
    const weekStart = new Date(today);
    weekStart.setUTCDate(today.getUTCDate() + w * 7);
    for (const dow of days_of_week) {
      const date = nextOccurrence(w === 0 ? today : weekStart, dow);
      classes.push({
        title,
        trainer_name: trainer_name || null,
        class_date: date.toISOString().split('T')[0],
        start_time,
        end_time,
        capacity: cap,
        // Without a category these classes are invisible to tier-restricted
        // members, exactly like the Add Class bug.
        category: category || null,
        instructor_id: instructor_id || null,
      });
    }
  }

  const db = getServiceClient();
  const { error } = await db.from('classes').insert(classes);
  if (error) return NextResponse.json({ error: 'Failed to create classes' }, { status: 500 });

  await logAudit((admin as { phone: string }).phone, 'recurring_classes_created', 'class', undefined, { title, created: classes.length, weeks }).catch(() => {});
  return NextResponse.json({ ok: true, created: classes.length });
}
