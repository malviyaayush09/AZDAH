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

type PackRow = {
  id: string;
  member_id: string;
  plan_id: string | null;
  plan_name: string | null;
  amount_paid_paise: number | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  created_at: string;
  membership_plans: unknown;
};

/**
 * Revenue, counted once per PURCHASE.
 *
 * This used to read one row per member and resolve the amount through
 * members.razorpay_order_id — a column that only ever holds the most recent
 * order. Every repeat purchase was therefore invisible: five members had bought
 * a second pack and the page understated income by about Rs 24,700, widening
 * with every repeat sale. Multi-pack exists to encourage exactly those, so the
 * error compounds.
 *
 * member_packs is the real ledger: one row per pack sold, each carrying its own
 * order id, payment id and the amount actually charged.
 */
export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getServiceClient();
  const categoryFilter = req.nextUrl.searchParams.get('category'); // 'pole_nimisha' | 'all' | null

  const [{ data: packRows }, { data: memberRows }] = await Promise.all([
    db.from('member_packs')
      .select('id, member_id, plan_id, plan_name, amount_paid_paise, razorpay_order_id, razorpay_payment_id, created_at, membership_plans(name, price_paise, plan_category)')
      .order('created_at', { ascending: true }),
    db.from('members').select('id, refunded_paise'),
  ]);

  // A pack with no order and no payment id was created by hand or by the
  // backfill. It represents no money and must not be counted as income.
  const all = ((packRows || []) as unknown as PackRow[])
    .filter((p) => p.razorpay_order_id || p.razorpay_payment_id);

  // What was actually charged for each order — a promo code changes this, and
  // the plan's price_paise is only a list price.
  const orderIds = all.map((p) => p.razorpay_order_id).filter(Boolean) as string[];
  const paidByOrder = new Map<string, number>();
  for (let i = 0; i < orderIds.length; i += 200) {
    const { data: intents } = await db
      .from('payment_intents')
      .select('order_id, amount_paise')
      .in('order_id', orderIds.slice(i, i + 200));
    for (const it of intents || []) {
      if (it.amount_paise != null) paidByOrder.set(it.order_id, it.amount_paise);
    }
  }

  const grossOf = (p: PackRow) => {
    if (p.amount_paid_paise != null) return p.amount_paid_paise;
    const paid = p.razorpay_order_id ? paidByOrder.get(p.razorpay_order_id) : undefined;
    return paid ?? pick(p.membership_plans)?.price_paise ?? 0;
  };

  /**
   * Refunds are recorded per member, not per pack, so each is applied once
   * against that member's newest pack. Subtracting per pack would deduct the
   * same refund several times over for anyone holding more than one.
   */
  const refundByMember = new Map<string, number>();
  for (const m of memberRows || []) {
    if (m.refunded_paise) refundByMember.set(m.id, m.refunded_paise);
  }
  const newestPackOf = new Map<string, string>();
  for (const p of all) newestPackOf.set(p.member_id, p.id);   // ascending order, last wins

  const netOf = (p: PackRow) => {
    const gross = grossOf(p);
    const refund = newestPackOf.get(p.member_id) === p.id ? (refundByMember.get(p.member_id) || 0) : 0;
    return Math.max(0, gross - refund);
  };

  const nameOf = (p: PackRow) => p.plan_name || pick(p.membership_plans)?.name || 'Unknown';
  const catOf = (p: PackRow) => pick(p.membership_plans)?.plan_category || 'other';

  // Split by tier, always over every sale regardless of the filter.
  const byCatMap = new Map<string, { category: string; revenue: number; members: number }>();
  for (const p of all) {
    const c = catOf(p);
    if (!byCatMap.has(c)) byCatMap.set(c, { category: c, revenue: 0, members: 0 });
    const e = byCatMap.get(c)!;
    e.revenue += netOf(p);
    e.members += 1;
  }
  const by_category = Array.from(byCatMap.values()).sort((a, b) => b.revenue - a.revenue);

  const rows = categoryFilter && categoryFilter !== 'all' ? all.filter((p) => catOf(p) === categoryFilter) : all;

  if (!rows.length) {
    return NextResponse.json({ total_paise: 0, total_members: 0, monthly: [], yearly: [], recent: [], by_category });
  }

  const monthlyMap = new Map<string, { month: string; revenue: number; members: number }>();
  let totalPaise = 0;
  for (const p of rows) {
    const net = netOf(p);
    totalPaise += net;
    // The pack's own date — when the money came in — rather than when the
    // member first joined, which filed a repeat purchase under the wrong month.
    const d = new Date(p.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    if (!monthlyMap.has(key)) monthlyMap.set(key, { month: label, revenue: 0, members: 0 });
    const entry = monthlyMap.get(key)!;
    entry.revenue += net;
    entry.members += 1;
  }
  const monthly = Array.from(monthlyMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v).slice(-12);

  const yearlyMap = new Map<string, { year: string; revenue: number; members: number }>();
  for (const p of rows) {
    const year = new Date(p.created_at).getFullYear().toString();
    if (!yearlyMap.has(year)) yearlyMap.set(year, { year, revenue: 0, members: 0 });
    const entry = yearlyMap.get(year)!;
    entry.revenue += netOf(p);
    entry.members += 1;
  }
  const yearly = Array.from(yearlyMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);

  const recent = rows.slice(-10).reverse().map((p) => ({
    date: p.created_at,
    plan: nameOf(p),
    price_paise: netOf(p),
  }));

  // Distinct paying members, not the number of sales — the label says members.
  const total_members = new Set(rows.map((p) => p.member_id)).size;

  return NextResponse.json({ total_paise: totalPaise, total_members, monthly, yearly, recent, by_category });
}
