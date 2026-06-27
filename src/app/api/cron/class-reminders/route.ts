export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { sendClassReminder } from '@/lib/whatsapp';

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getServiceClient();
  const now = new Date();

  // Find bookings for classes starting in 1.5–2.5 hours that haven't been reminded
  const from = new Date(now.getTime() + 90 * 60 * 1000);
  const to = new Date(now.getTime() + 150 * 60 * 1000);

  const fromDate = from.toISOString().split('T')[0];
  const toDate = to.toISOString().split('T')[0];
  const fromTime = from.toTimeString().slice(0, 5);
  const toTime = to.toTimeString().slice(0, 5);

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

  let sent = 0;
  for (const booking of bookings || []) {
    const clsRaw = booking.classes;
    const cls = (Array.isArray(clsRaw) ? clsRaw[0] : clsRaw) as { title: string; class_date: string; start_time: string } | null;
    if (!cls) continue;

    // Check if class is in the 1.5–2.5 hour window
    const classStart = new Date(`${cls.class_date}T${cls.start_time}`);
    const diffMs = classStart.getTime() - now.getTime();
    const diffMins = diffMs / 60000;
    if (diffMins < 90 || diffMins > 150) continue;

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
