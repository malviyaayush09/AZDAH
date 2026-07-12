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

type PlanJoin = { name: string; price_paise: number; plan_category: string } | null;
const pick = (raw: unknown) => (Array.isArray(raw) ? raw[0] : raw) as PlanJoin;

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getServiceClient();
  const categoryFilter = req.nextUrl.searchParams.get('category'); // e.g. 'pole_nimisha' | 'all' | null

  const { data: members } = await db
    .from('members')
    .select('created_at, plan_id, razorpay_payment_id, membership_plans(name, price_paise, plan_category)')
    .not('razorpay_payment_id', 'is', null)
    .order('created_at', { ascending: true });

  const all = members || [];
  const priceOf = (m: (typeof all)[number]) => pick(m.membership_plans)?.price_paise || 0;
  const nameOf = (m: (typeof all)[number]) => pick(m.membership_plans)?.name || 'Unknown';
  const catOf = (m: (typeof all)[number]) => pick(m.membership_plans)?.plan_category || 'other';

  // Revenue split by trainer/tier — always computed over ALL sales.
  const byCatMap = new Map<string, { category: string; revenue: number; members: number }>();
  for (const m of all) {
    const c = catOf(m);
    if (!byCatMap.has(c)) byCatMap.set(c, { category: c, revenue: 0, members: 0 });
    const e = byCatMap.get(c)!;
    e.revenue += priceOf(m);
    e.members += 1;
  }
  const by_category = Array.from(byCatMap.values()).sort((a, b) => b.revenue - a.revenue);

  // Detailed views respect the selected tier filter (if any).
  const rows = categoryFilter && categoryFilter !== 'all' ? all.filter((m) => catOf(m) === categoryFilter) : all;

  if (!rows.length) {
    return NextResponse.json({ total_paise: 0, total_members: 0, monthly: [], yearly: [], recent: [], by_category });
  }

  const monthlyMap = new Map<string, { month: string; revenue: number; members: number }>();
  let totalPaise = 0;
  for (const m of rows) {
    const price = priceOf(m);
    totalPaise += price;
    const d = new Date(m.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    if (!monthlyMap.has(key)) monthlyMap.set(key, { month: label, revenue: 0, members: 0 });
    const entry = monthlyMap.get(key)!;
    entry.revenue += price;
    entry.members += 1;
  }
  const monthly = Array.from(monthlyMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v).slice(-12);

  const yearlyMap = new Map<string, { year: string; revenue: number; members: number }>();
  for (const m of rows) {
    const year = new Date(m.created_at).getFullYear().toString();
    if (!yearlyMap.has(year)) yearlyMap.set(year, { year, revenue: 0, members: 0 });
    const entry = yearlyMap.get(year)!;
    entry.revenue += priceOf(m);
    entry.members += 1;
  }
  const yearly = Array.from(yearlyMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);

  const recent = rows.slice(-10).reverse().map((m) => ({
    date: m.created_at,
    plan: nameOf(m),
    price_paise: priceOf(m),
  }));

  return NextResponse.json({ total_paise: totalPaise, total_members: rows.length, monthly, yearly, recent, by_category });
}
