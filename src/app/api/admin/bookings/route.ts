export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { todayIST } from '@/lib/date';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  if (!session || (session as { role: string }).role !== 'admin') return null;
  return session;
}

type Row = {
  id: string;
  status: string;
  attended: boolean | null;
  pack_id: string | null;
  members: { id: string; name: string; phone: string } | null;
  classes: {
    id: string; title: string; trainer_name: string | null;
    class_date: string; start_time: string; category: string | null;
    is_cancelled: boolean;
  } | null;
};

/**
 * Every booking in a window, or every booking for one member.
 *
 * Until this existed the only way to see who was in a class was to open that
 * class and read its list, one at a time — so "which classes is this member
 * coming to?" could not be answered at all, and "who is in this week?" meant
 * clicking through every slot. Both screens now read from here.
 *
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD   bookings across a date range
 *   ?member_id=<uuid>                that member's bookings
 *   ?upcoming=1                      today onwards only
 *
 * Cancelled classes are dropped: nobody is attending those, and leaving them
 * in makes a member look busier than they are.
 */
export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const memberId = searchParams.get('member_id');
  const upcoming = searchParams.get('upcoming') === '1';

  if (!memberId && !(from && to)) {
    return NextResponse.json(
      { error: 'Pass either member_id, or both from and to' },
      { status: 400 },
    );
  }

  const db = getServiceClient();

  let q = db
    .from('bookings')
    .select(
      'id, status, attended, pack_id,' +
      'members!inner(id, name, phone),' +
      'classes!inner(id, title, trainer_name, class_date, start_time, category, is_cancelled)',
    )
    .eq('status', 'confirmed')
    .eq('classes.is_cancelled', false);

  if (memberId) q = q.eq('member_id', memberId);
  if (from) q = q.gte('classes.class_date', from);
  if (to) q = q.lte('classes.class_date', to);
  if (upcoming) q = q.gte('classes.class_date', todayIST());

  const { data, error } = await q.limit(2000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data || []) as unknown as Row[];

  // Which pack paid for each booking. Named rather than shown as an id so the
  // calendar can be filtered by plan.
  const packIds = Array.from(new Set(rows.map((r) => r.pack_id).filter(Boolean))) as string[];
  const packName = new Map<string, string>();
  if (packIds.length) {
    const { data: packs } = await db
      .from('member_packs')
      .select('id, plan_name')
      .in('id', packIds);
    for (const p of packs || []) packName.set(p.id, p.plan_name);
  }

  const bookings = rows
    .filter((r) => r.classes && r.members)
    .map((r) => ({
      id: r.id,
      attended: r.attended,
      class_id: r.classes!.id,
      title: r.classes!.title,
      trainer_name: r.classes!.trainer_name,
      class_date: r.classes!.class_date,
      start_time: r.classes!.start_time,
      category: r.classes!.category,
      member_id: r.members!.id,
      member_name: r.members!.name,
      member_phone: r.members!.phone,
      // No pack means a legacy booking made before packs existed.
      plan_name: r.pack_id ? packName.get(r.pack_id) || null : null,
    }))
    .sort((a, b) =>
      a.class_date === b.class_date
        ? a.start_time.localeCompare(b.start_time)
        : a.class_date.localeCompare(b.class_date));

  return NextResponse.json({ bookings });
}
