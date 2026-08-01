export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  return session && (session as { role: string }).role === 'admin' ? session : null;
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getServiceClient();
  const { data, error } = await db
    .from('members')
    .select(`
      name, phone, email, created_at,
      plan_start, plan_end,
      membership_plans(name, price_paise),
      razorpay_payment_id, razorpay_order_id
    `)
    .not('razorpay_payment_id', 'is', null)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 });

  // Amount actually charged (promo-aware) — a plan's price_paise is only a list
  // price and overstates income whenever a discount was applied at checkout.
  const orderIds = (data || []).map((m) => m.razorpay_order_id).filter(Boolean) as string[];
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

  const toDate = (s: string) => {
    const d = s.includes('T') ? new Date(s) : new Date(s + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const headers = ['Name', 'Phone', 'Email', 'Plan', 'Amount Paid (₹)', 'List Price (₹)', 'Payment ID', 'Order ID', 'Start Date', 'End Date', 'Paid On'];
  const rows = (data || []).map((m) => {
    const planRaw = m.membership_plans;
    const plan = (Array.isArray(planRaw) ? planRaw[0] : planRaw) as { name: string; price_paise: number } | null;
    const paidPaise = (m.razorpay_order_id ? paidByOrder.get(m.razorpay_order_id) : undefined) ?? plan?.price_paise;
    return [
      m.name,
      m.phone,
      m.email || '',
      plan?.name ?? '',
      paidPaise != null ? String(paidPaise / 100) : '',
      plan ? String(plan.price_paise / 100) : '',
      m.razorpay_payment_id || '',
      m.razorpay_order_id || '',
      m.plan_start ? toDate(m.plan_start) : '',
      m.plan_end ? toDate(m.plan_end) : '',
      m.created_at ? toDate(m.created_at) : '',
    ];
  });

  // Neutralize spreadsheet formula injection (a member's name/email could start
  // with = + - @) before CSV-quoting.
  const escapeCell = (v: unknown) => {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = [headers, ...rows]
    .map(row => row.map(escapeCell).join(','))
    .join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="azdah-revenue-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
