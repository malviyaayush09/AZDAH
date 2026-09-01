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
