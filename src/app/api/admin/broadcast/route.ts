export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { sendAdminBroadcast } from '@/lib/whatsapp';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  return session && (session as { role: string }).role === 'admin' ? session : null;
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { message, audience } = await req.json() as { message: string; audience: 'all' | 'active' | 'expiring' };

  if (!message || message.trim().length < 5) {
    return NextResponse.json({ error: 'Message too short' }, { status: 400 });
  }
  if (!['all', 'active', 'expiring'].includes(audience)) {
    return NextResponse.json({ error: 'Invalid audience' }, { status: 400 });
  }

  const db = getServiceClient();
  let query = db.from('members').select('id, name, phone').eq('is_active', true);

  if (audience === 'expiring') {
    const today = new Date().toISOString().split('T')[0];
    const in7Days = new Date();
    in7Days.setDate(in7Days.getDate() + 7);
    query = query.lte('plan_end', in7Days.toISOString().split('T')[0]).gte('plan_end', today) as typeof query;
  }
  // 'all' includes inactive members too — re-query without is_active filter
  const finalQuery = audience === 'all'
    ? db.from('members').select('id, name, phone')
    : query;

  const { data: recipients, error } = await finalQuery;
  if (error) return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });

  let sent = 0;
  let failed = 0;
  for (const m of recipients || []) {
    try {
      await sendAdminBroadcast(m.phone, m.name, message);
      sent++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ ok: true, sent, failed, total: recipients?.length ?? 0 });
}
