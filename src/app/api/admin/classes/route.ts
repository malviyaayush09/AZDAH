export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { todayIST } from '@/lib/date';
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
  const today = todayIST();

  /*
   * Classes that have already happened are part of the studio's records.
   *
   * This started at `class_date >= today`, so the calendar's Prev button led
   * to empty weeks and there was no way to check what had actually run, who
   * had been in it, or who had attended. The studio asked for exactly this --
   * "it's needed for our records, I need to be able to cross check" -- and was
   * clear it is for the admin only. The member view already drops finished
   * classes of its own accord, so nothing changes for them.
   *
   * `from` is accepted so the window can be widened later without another
   * deploy. The default reaches back ninety days, which covers the studio's
   * whole history today and keeps the response bounded as the timetable grows.
   */
  const fromParam = req.nextUrl.searchParams.get('from');
  const defaultFrom = (() => {
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() - 90);
    return d.toISOString().split('T')[0];
  })();
  const from = fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : defaultFrom;

  const { data: classes } = await db
    .from('classes')
    .select('id, title, trainer_name, class_date, start_time, end_time, capacity, is_cancelled')
    .gte('class_date', from)
    .order('class_date', { ascending: true })
    .order('start_time', { ascending: true });

  const list = classes || [];

  /*
   * Booking counts in one query, not one per class.
   *
   * This ran an RPC per class inside Promise.all. At sixty upcoming classes
   * that was sixty round trips on every load of the admin panel; including the
   * past would have made it two hundred and sixty, growing with every cycle
   * the studio publishes. Edge functions have a subrequest ceiling, so that
   * was a wall with a date on it rather than a slow page.
   *
   * The same shape classes/public already uses: one read, counted here.
   */
  const ids = list.map((c) => c.id);
  const { data: booked } = ids.length
    ? await db.from('bookings').select('class_id').eq('status', 'confirmed').in('class_id', ids)
    : { data: [] as { class_id: string }[] };

  const countByClass = new Map<string, number>();
  for (const b of booked || []) {
    countByClass.set(b.class_id, (countByClass.get(b.class_id) || 0) + 1);
  }

  const enriched = list.map((cls) => ({
    ...cls,
    booked_count: countByClass.get(cls.id) || 0,
    // Said once here so every view agrees on what "already happened" means,
    // rather than each one comparing dates its own way.
    is_past: (cls.class_date as string) < today,
  }));

  return NextResponse.json({ classes: enriched, from });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const { title, trainer_name, class_date, start_time, end_time, capacity, category, instructor_id } = body;

  if (!title || !class_date || !start_time || !end_time || !capacity) {
    return NextResponse.json({ error: 'All fields except trainer are required' }, { status: 400 });
  }

  // Without these a class could be saved ending before it starts, with a
  // nonsense capacity, or dated in the past — all of which look like app bugs
  // to members later.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(class_date))) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
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
  if (String(class_date) < todayIST()) {
    return NextResponse.json({ error: 'Cannot schedule a class in the past' }, { status: 400 });
  }
  if (String(title).trim().length < 2 || String(title).length > 80) {
    return NextResponse.json({ error: 'Title must be 2–80 characters' }, { status: 400 });
  }

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

  const db = getServiceClient();
  // Category matters: the member class list filters by the categories a pack
  // allows, so a class saved without one is invisible to tier-restricted
  // members — and it also skips the tier gate when booking.
  const { error } = await db.from('classes').insert({
    title,
    trainer_name: trainer_name || null,
    class_date,
    start_time,
    end_time,
    capacity: cap,
    category: category || null,
    instructor_id: instructor_id || null,
  });

  if (error) return NextResponse.json({ error: 'Failed to create class' }, { status: 500 });
  await logAudit(admin.phone, 'class_created', 'class', undefined, { title, class_date, start_time }).catch(() => {});
  return NextResponse.json({ success: true });
}
