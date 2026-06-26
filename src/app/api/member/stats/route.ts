export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + diff);
  return mon.toISOString().split('T')[0];
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  if (!session || (session as { role: string }).role !== 'member') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { memberId } = session as { memberId: string };

  const db = getServiceClient();
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const empty = { total_attended: 0, this_month: 0, this_week: 0, streak_weeks: 0, attendance_rate: 0, favorite_trainer: null, weekly_data: [] };

  const { data: bookings } = await db
    .from('bookings')
    .select('id, attended, class_id')
    .eq('member_id', memberId)
    .eq('status', 'confirmed');

  if (!bookings?.length) return NextResponse.json(empty);

  const classIds = bookings.map(b => b.class_id);
  const { data: classes } = await db
    .from('classes')
    .select('id, class_date, trainer_name')
    .in('id', classIds);

  if (!classes?.length) return NextResponse.json(empty);

  const classMap = new Map(classes.map(c => [c.id, c]));

  const past = bookings
    .map(b => ({ ...b, cls: classMap.get(b.class_id) }))
    .filter(b => !!b.cls);

  const attended = past.filter(b => b.attended === true);
  const total_attended = attended.length;
  const attendance_rate = past.length > 0 ? Math.round((total_attended / past.length) * 100) : 0;

  const yr = now.getUTCFullYear();
  const mo = String(now.getUTCMonth() + 1).padStart(2, '0');
  const monthStart = `${yr}-${mo}-01`;
  const this_month = attended.filter(b => b.cls!.class_date >= monthStart).length;

  const thisMonday = mondayOf(todayStr);
  const this_week = attended.filter(b => b.cls!.class_date >= thisMonday).length;

  const trainerCount: Record<string, number> = {};
  for (const b of attended) {
    const t = b.cls!.trainer_name;
    if (t) trainerCount[t] = (trainerCount[t] || 0) + 1;
  }
  const favorite_trainer = Object.keys(trainerCount).length
    ? Object.entries(trainerCount).sort((a, b) => b[1] - a[1])[0][0]
    : null;

  const weekMap: Record<string, number> = {};
  for (const b of attended) {
    const wk = mondayOf(b.cls!.class_date);
    weekMap[wk] = (weekMap[wk] || 0) + 1;
  }

  const thisMondayMs = new Date(thisMonday + 'T00:00:00Z').getTime();
  const weekly_data = Array.from({ length: 8 }, (_, i) => {
    const ms = thisMondayMs - (7 - i) * 7 * 86400000;
    const wk = new Date(ms).toISOString().split('T')[0];
    return { week: wk, count: weekMap[wk] || 0 };
  });

  // Streak: consecutive weeks going back; skip current week if no classes yet
  let streak_weeks = 0;
  const startIdx = weekly_data[7].count === 0 ? 6 : 7;
  for (let i = startIdx; i >= 0; i--) {
    if (weekly_data[i].count > 0) streak_weeks++;
    else break;
  }

  return NextResponse.json({ total_attended, this_month, this_week, streak_weeks, attendance_rate, favorite_trainer, weekly_data });
}
