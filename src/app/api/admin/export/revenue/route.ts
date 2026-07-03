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

  const toDate = (s: string) => {
    const d = s.includes('T') ? new Date(s) : new Date(s + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const headers = ['Name', 'Phone', 'Email', 'Plan', 'Amount (₹)', 'Payment ID', 'Order ID', 'Start Date', 'End Date', 'Paid On'];
  const rows = (data || []).map((m) => {
    const planRaw = m.membership_plans;
    const plan = (Array.isArray(planRaw) ? planRaw[0] : planRaw) as { name: string; price_paise: number } | null;
    return [
      m.name,
      m.phone,
      m.email || '',
      plan?.name ?? '',
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
