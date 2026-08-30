export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { todayIST, classHasStarted } from '@/lib/date';

/**
 * The timetable, readable without an account.
 *
 * Somebody deciding whether to buy a pack has to be able to see what is on and
 * when. This is the only class endpoint that does not require a login, so it is
 * deliberately careful about what it exposes:
 *
 *   · capacity and booking counts NEVER leave the server. A class is described
 *     only as full or not — the studio does not want "3 of 8 spots taken" shown,
 *     and how full a class is is nobody else's business.
 *   · no member data, no booking ids.
 *
 * It previously selected classes.booked_count, a column that does not exist, so
 * every request 400'd and the route silently answered {"classes":[]}. Nothing
 * called it, so nobody noticed.
 */
export async function GET() {
  const db = getServiceClient();
  const today = todayIST();

  // Everything still to come. The old version stopped at 14 days — the same
  // mistake that hid every class past 12 September from members. The studio
  // publishes cycles longer than a fortnight.
  const { data: classes } = await db
    .from('classes')
    .select('id, title, trainer_name, class_date, start_time, end_time, capacity, category')
    .eq('is_cancelled', false)
    .gte('class_date', today)
    .order('class_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(400);

  const list = classes || [];

  // How full each class is, in ONE query rather than a count per class. This is
  // a public endpoint and can be hit hard; a per-class round trip would mean
  // roughly 45 queries per page view.
  const ids = list.map((c) => c.id);
  const { data: booked } = ids.length
    ? await db.from('bookings').select('class_id').eq('status', 'confirmed').in('class_id', ids)
    : { data: [] as { class_id: string }[] };

  const takenByClass = new Map<string, number>();
  for (const b of booked || []) {
    takenByClass.set(b.class_id, (takenByClass.get(b.class_id) || 0) + 1);
  }

  const upcoming = list
    // A class that already started today is not bookable, so it is not "on".
    .filter((c) => !classHasStarted(c.class_date, c.start_time))
    .map((c) => ({
      id: c.id,
      title: c.title,
      trainer_name: c.trainer_name,
      class_date: c.class_date,
      start_time: c.start_time,
      end_time: c.end_time,
      category: c.category,
      // The only availability signal that leaves the server.
      is_full: (takenByClass.get(c.id) || 0) >= c.capacity,
    }));

  return NextResponse.json({ classes: upcoming });
}
