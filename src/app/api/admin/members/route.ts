export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  if (!session || (session as { role: string }).role !== 'admin') return null;
  return session;
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getServiceClient();
  const { data: members } = await db
    .from('members')
    .select('id, name, phone, plan_id, plan_start, plan_end, is_active, reschedule_used_this_month, razorpay_payment_id, created_at, membership_plans(name)')
    .order('created_at', { ascending: false });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7 = new Date(today);
  in7.setDate(in7.getDate() + 7);

  const enriched = (members || []).map((m) => {
    const planEnd = m.plan_end ? new Date(m.plan_end) : new Date(0);
    const diffMs = planEnd.getTime() - today.getTime();
    const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    return {
      ...m,
      plan_name: (Array.isArray(m.membership_plans) ? m.membership_plans[0] : m.membership_plans as { name: string } | null)?.name || 'Unknown',
      days_remaining: daysRemaining,
      reschedule_used: m.reschedule_used_this_month,
      membership_plans: undefined,
    };
  });

  const stats = {
    total_members: enriched.length,
    active_members: enriched.filter((m) => m.is_active && m.days_remaining > 0).length,
    expiring_soon: enriched.filter((m) => m.is_active && m.days_remaining <= 7 && m.days_remaining > 0).length,
  };

  return NextResponse.json({ members: enriched, stats });
}
