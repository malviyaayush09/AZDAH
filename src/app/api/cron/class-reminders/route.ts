export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { sendClassReminder } from '@/lib/whatsapp';
import { todayIST, classHasStarted } from '@/lib/date';

export async function GET(req: NextRequest) {
  // Vercel Cron authenticates with `Authorization: Bearer <CRON_SECRET>`;
  // accept the custom header too so manual/curl invocations still work.
  const secret = process.env.CRON_SECRET;
  const authorized =
    req.headers.get('x-cron-secret') === secret ||
    req.headers.get('authorization') === `Bearer ${secret}`;
  if (!secret || !authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getServiceClient();
  const today = todayIST();

  // Vercel's Hobby plan allows only ONE cron run per day, so this cannot be a
  // "2 hours before class" reminder — a single daily run would only ever catch
  // the handful of classes in that window and silently skip everyone else.
  // Instead this is a morning digest: remind anyone booked into a class later
  // TODAY. Runs 07:30 IST (02:00 UTC).

  // Fetch confirmed bookings with class + member info
  const { data: bookings, error } = await db
    .from('bookings')
    .select(`
      id,
      reminder_sent,
      members(name, phone),
      classes(title, class_date, start_time)
    `)
    .eq('status', 'confirmed')
    .eq('reminder_sent', false);

  if (error) {
    console.error('Class reminder query failed:', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  /**
   * With the WhatsApp kill switch off, sendX() returns immediately and throws
   * nothing — so the loop below would mark every member as reminded while not a
   * single message left the building. Those flags are never revisited, so the
   * day the switch is turned on, everyone already marked silently never hears
   * from us. Two members were already in that state.
   *
   * Do nothing at all rather than record work that did not happen.
   */
  if (process.env.WHATSAPP_ENABLED !== 'true') {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'WhatsApp is off. Nothing sent, and nothing marked as sent, so these are still due when it is enabled.',
    });
  }

  let sent = 0;
  for (const booking of bookings || []) {
    const clsRaw = booking.classes;
    const cls = (Array.isArray(clsRaw) ? clsRaw[0] : clsRaw) as { title: string; class_date: string; start_time: string } | null;
    if (!cls) continue;

    // Only classes happening later today (IST) — skip other days, and skip any
    // class that has already started.
    if (cls.class_date !== today) continue;
    if (classHasStarted(cls.class_date, cls.start_time)) continue;

    const memberRaw = booking.members;
    const member = (Array.isArray(memberRaw) ? memberRaw[0] : memberRaw) as { name: string; phone: string } | null;
    if (!member) continue;

    try {
      await sendClassReminder(member.phone, member.name, cls.title, cls.start_time);
      await db.from('bookings').update({ reminder_sent: true }).eq('id', booking.id);
      sent++;
    } catch (err) {
      console.error(`Reminder failed for booking ${booking.id}:`, err);
    }
  }

  return NextResponse.json({ ok: true, sent });
}
