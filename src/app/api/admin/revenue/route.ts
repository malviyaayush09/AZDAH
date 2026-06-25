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
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getServiceClient();

  // Fetch all paid members with their plan prices
  const { data: members } = await db
    .from('members')
    .select('created_at, plan_id, razorpay_payment_id, membership_plans(name, price_paise)')
    .not('razorpay_payment_id', 'is', null)
    .order('created_at', { ascending: true });

  if (!members?.length) {
    return NextResponse.json({ total_paise: 0, total_members: 0, monthly: [], recent: [] });
  }

  // Monthly breakdown
  const monthlyMap = new Map<string, { month: string; revenue: number; members: number }>();
  let totalPaise = 0;

  for (const m of members) {
    const plans = m.membership_plans;
    const price = (Array.isArray(plans) ? plans[0] : plans as { price_paise: number } | null)?.price_paise || 0;
    const planName = (Array.isArray(plans) ? plans[0] : plans as { name: string } | null)?.name || 'Unknown';
    totalPaise += price;

    const d = new Date(m.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

    if (!monthlyMap.has(key)) monthlyMap.set(key, { month: label, revenue: 0, members: 0 });
    const entry = monthlyMap.get(key)!;
    entry.revenue += price;
    entry.members += 1;
  }

  const monthly = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v)
    .slice(-12); // Last 12 months

  // Recent 10 payments
  const recent = members.slice(-10).reverse().map(m => {
    const plans = m.membership_plans;
    return {
      date: m.created_at,
      plan: (Array.isArray(plans) ? plans[0] : plans as { name: string } | null)?.name || 'Unknown',
      price_paise: (Array.isArray(plans) ? plans[0] : plans as { price_paise: number } | null)?.price_paise || 0,
    };
  });

  return NextResponse.json({
    total_paise: totalPaise,
    total_members: members.length,
    monthly,
    recent,
  });
}
