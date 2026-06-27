export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  return session && (session as { role: string }).role === 'admin' ? session : null;
}

// Day-of-week numbers: 0=Sun, 1=Mon, ..., 6=Sat
function nextOccurrence(fromDate: Date, targetDow: number): Date {
  const d = new Date(fromDate);
  d.setHours(0, 0, 0, 0);
  const delta = (targetDow - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + delta);
  return d;
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, trainer_name, days_of_week, start_time, end_time, capacity, weeks } =
    await req.json() as {
      title: string;
      trainer_name?: string;
      days_of_week: number[]; // 0-6
      start_time: string;
      end_time: string;
      capacity: number;
      weeks: number; // how many weeks to generate (1–12)
    };

  if (!title || !days_of_week?.length || !start_time || !end_time || !capacity || !weeks) {
    return NextResponse.json({ error: 'All fields required' }, { status: 400 });
  }
  if (weeks < 1 || weeks > 12) {
    return NextResponse.json({ error: 'Weeks must be 1–12' }, { status: 400 });
  }

  const today = new Date();
  const classes: { title: string; trainer_name: string | null; class_date: string; start_time: string; end_time: string; capacity: number }[] = [];

  for (let w = 0; w < weeks; w++) {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() + w * 7);
    for (const dow of days_of_week) {
      const date = nextOccurrence(w === 0 ? today : weekStart, dow);
      classes.push({
        title,
        trainer_name: trainer_name || null,
        class_date: date.toISOString().split('T')[0],
        start_time,
        end_time,
        capacity: parseInt(String(capacity)),
      });
    }
  }

  const db = getServiceClient();
  const { error } = await db.from('classes').insert(classes);
  if (error) return NextResponse.json({ error: 'Failed to create classes' }, { status: 500 });

  return NextResponse.json({ ok: true, created: classes.length });
}
