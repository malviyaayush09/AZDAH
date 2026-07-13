export const runtime = 'edge';
// Never cache — the list must reflect newly-created / edited workshops
// immediately. Without this, Next statically caches this GET (it reads no
// cookies/headers) and serves a stale list.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { todayIST } from '@/lib/date';

// Public list of upcoming, active workshops. Never exposes registration
// counts or remaining spots — only an `is_full` flag (per the studio's
// "don't show slots left" rule).
export async function GET() {
  const db = getServiceClient();
  const today = todayIST();

  const { data: workshops, error } = await db
    .from('workshops')
    .select('id, title, description, instructor_name, workshop_date, start_time, end_time, capacity, price_paise, location, image_url')
    .eq('is_active', true)
    .gte('workshop_date', today)
    .order('workshop_date')
    .order('start_time');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = await Promise.all(
    (workshops || []).map(async (w) => {
      const { count } = await db
        .from('workshop_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('workshop_id', w.id)
        .eq('status', 'confirmed');
      return {
        id: w.id,
        title: w.title,
        description: w.description,
        instructor_name: w.instructor_name,
        workshop_date: w.workshop_date,
        start_time: w.start_time,
        end_time: w.end_time,
        location: w.location,
        image_url: w.image_url,
        price_paise: w.price_paise,
        is_free: w.price_paise === 0,
        is_full: (count || 0) >= w.capacity,
      };
    })
  );

  return NextResponse.json({ workshops: list });
}
