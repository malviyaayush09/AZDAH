export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { sendExpiryReminder } from '@/lib/whatsapp';
import { todayIST } from '@/lib/date';

// Called daily by Vercel Cron — no session auth, protected by CRON_SECRET header
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

  // Members expiring in exactly 3 days who haven't been reminded yet.
  // Anchor on the studio's calendar day (IST), not the server's UTC day —
  // otherwise the target lands on the wrong date for half of each day.
  const [ty, tm, td] = todayIST().split('-').map(Number);
  const target = new Date(Date.UTC(ty, tm - 1, td + 3)).toISOString().split('T')[0];

  const { data: expiring, error } = await db
    .from('members')
    .select('id, name, phone, plan_end, plan_name:membership_plans(name)')
    .eq('plan_end', target)
    .eq('is_active', true)
    .eq('expiry_reminder_sent', false);

  if (error) {
    console.error('Expiry reminder query failed:', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  let sent = 0;
  for (const member of expiring || []) {
    try {
      const planRaw = member.plan_name;
      const planName = ((Array.isArray(planRaw) ? planRaw[0] : planRaw) as { name: string } | null)?.name ?? 'your plan';
      await sendExpiryReminder(member.phone, member.name, planName, '3 days');
      await db.from('members').update({ expiry_reminder_sent: true }).eq('id', member.id);
      sent++;
    } catch (err) {
      console.error(`Reminder failed for member ${member.id}:`, err);
    }
  }

  return NextResponse.json({ ok: true, sent, total: expiring?.length ?? 0 });
}
