// Node runtime — calls to api.razorpay.com return HTTP 406 from the edge
// runtime (same reason /api/create-order and the refund route were moved).

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  return session && (session as { role: string }).role === 'admin' ? session : null;
}

type Orphan = {
  order_id: string;
  payment_id: string | null;
  name: string;
  phone: string;
  email: string | null;
  amount_paise: number | null;
  created_at: string;
  reason: string;
};

/**
 * A membership payment can be captured by Razorpay while no member ever gets
 * created — the browser dies between paying and /api/verify-payment running,
 * and the webhook is the only safety net. Money is taken, nothing is
 * delivered, and nobody finds out. Workshops already surface this; memberships
 * did not, so these were completely invisible.
 *
 * A 'pending' intent on its own means nothing (most are abandoned checkouts),
 * so each one is confirmed against Razorpay before being reported.
 */
export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getServiceClient();
  const rpKeyId = process.env.RAZORPAY_KEY_ID;
  const rpKeySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!rpKeyId || !rpKeySecret) {
    return NextResponse.json({ orphans: [], checked: 0, error: 'Razorpay keys not configured' });
  }
  const authHeader = `Basic ${Buffer.from(`${rpKeyId}:${rpKeySecret}`).toString('base64')}`;

  // Look back 60 days, and ignore anything from the last 20 minutes so a
  // checkout still in progress isn't reported as lost.
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const settleCutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();

  const { data: intents } = await db
    .from('payment_intents')
    .select('order_id, phone, name, email, amount_paise, status, created_at')
    .eq('intent_type', 'membership')
    .gte('created_at', since)
    .lte('created_at', settleCutoff)
    .order('created_at', { ascending: false })
    .limit(60);

  const candidates = intents || [];
  if (candidates.length === 0) return NextResponse.json({ orphans: [], checked: 0 });

  // Which of these orders actually produced a member?
  const { data: members } = await db
    .from('members')
    .select('razorpay_order_id')
    .in('razorpay_order_id', candidates.map((c) => c.order_id));
  const provisioned = new Set((members || []).map((m) => m.razorpay_order_id));

  const unprovisioned = candidates.filter((c) => !provisioned.has(c.order_id));

  // Confirm against Razorpay: only orders with a genuinely captured payment
  // are orphans. Everything else is just an abandoned checkout.
  const orphans: Orphan[] = [];
  for (const intent of unprovisioned) {
    try {
      const res = await fetch(`https://api.razorpay.com/v1/orders/${intent.order_id}/payments`, {
        headers: { Authorization: authHeader, Accept: 'application/json' },
      });
      if (!res.ok) continue;
      const body = await res.json() as { items?: { id: string; status: string; amount: number }[] };
      const captured = (body.items || []).find((p) => p.status === 'captured');
      if (!captured) continue; // abandoned checkout, not an orphan

      orphans.push({
        order_id: intent.order_id,
        payment_id: captured.id,
        name: intent.name,
        phone: intent.phone,
        email: intent.email,
        amount_paise: captured.amount ?? intent.amount_paise,
        created_at: intent.created_at,
        reason: intent.status === 'completed'
          ? 'Payment captured and marked complete, but no member exists'
          : 'Payment captured but the member was never created',
      });
    } catch {
      // Network hiccup on one order shouldn't hide the rest.
      continue;
    }
  }

  return NextResponse.json({ orphans, checked: unprovisioned.length });
}
