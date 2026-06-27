export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { sendExpiryReminder } from '@/lib/whatsapp';

// Called daily by Vercel Cron — no session auth, protected by CRON_SECRET header
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getServiceClient();

  // Members expiring in exactly 3 days who haven't been reminded yet
  const today = new Date();
  const in3Days = new Date(today);
  in3Days.setDate(today.getDate() + 3);
  const target = in3Days.toISOString().split('T')[0];

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
