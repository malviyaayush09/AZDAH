// Runs on the Node.js default runtime — calls to api.razorpay.com fail with
// HTTP 406 from the edge runtime (same reason /api/create-order was moved).

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  return session && (session as { role: string }).role === 'admin' ? session : null;
}

export async function POST(req: NextRequest, { params }: { params: { memberId: string } }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { amount_paise, reason } = await req.json() as { amount_paise?: number; reason?: string };

  if (amount_paise !== undefined) {
    if (!Number.isInteger(amount_paise) || amount_paise <= 0) {
      return NextResponse.json({ error: 'amount_paise must be a positive integer' }, { status: 400 });
    }
  }

  const db = getServiceClient();
  const { data: member } = await db
    .from('members')
    .select('id, name, razorpay_payment_id')
    .eq('id', params.memberId)
    .single();

  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  if (!member.razorpay_payment_id) {
    return NextResponse.json({ error: 'No payment on file for this member' }, { status: 400 });
  }

  const rpKeyId = process.env.RAZORPAY_KEY_ID!;
  const rpKeySecret = process.env.RAZORPAY_KEY_SECRET!;
  const authHeader = `Basic ${btoa(`${rpKeyId}:${rpKeySecret}`)}`;

  // Ask Razorpay what was ACTUALLY captured (and already refunded) for this
  // payment — a plan's list price is irrelevant once a promo/discount was
  // applied at checkout, so it can never be trusted as the refund ceiling.
  const paymentRes = await fetch(`https://api.razorpay.com/v1/payments/${member.razorpay_payment_id}`, {
    headers: { Authorization: authHeader, Accept: 'application/json' },
  });
  if (!paymentRes.ok) {
    const text = await paymentRes.text().catch(() => '');
    let description = 'no details returned';
    let code: string | undefined;
    try {
      const err = JSON.parse(text) as { error?: { code?: string; description?: string } };
      description = err.error?.description ?? description;
      code = err.error?.code;
    } catch { /* body wasn't JSON */ }
    return NextResponse.json(
      {
        error: `Could not look up the original payment on Razorpay (HTTP ${paymentRes.status}): ${description}`,
        razorpay_code: code,
        payment_id: member.razorpay_payment_id,
      },
      { status: 502 },
    );
  }
  const payment = await paymentRes.json() as { amount: number; amount_refunded: number };
  const refundableAmount = payment.amount - (payment.amount_refunded ?? 0);
  if (refundableAmount <= 0) {
    return NextResponse.json({ error: 'This payment has already been fully refunded' }, { status: 400 });
  }

  const refundAmount = amount_paise ?? refundableAmount;
  if (refundAmount > refundableAmount) {
    return NextResponse.json({ error: 'Refund amount exceeds what remains refundable on this payment' }, { status: 400 });
  }

  const body: Record<string, unknown> = { amount: refundAmount };
  if (reason) body.notes = { reason };

  const res = await fetch(
    `https://api.razorpay.com/v1/payments/${member.razorpay_payment_id}/refund`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${rpKeyId}:${rpKeySecret}`)}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.json() as { error?: { description?: string } };
    return NextResponse.json(
      { error: err.error?.description ?? 'Razorpay refund failed' },
      { status: 400 }
    );
  }

  const refund = await res.json() as { id: string; amount: number };

  // Record the refund so revenue reporting can subtract it — a refunded member
  // used to keep counting as full income forever.
  const { data: current } = await db
    .from('members')
    .select('refunded_paise')
    .eq('id', params.memberId)
    .single();
  const update: Record<string, unknown> = {
    refunded_paise: (current?.refunded_paise ?? 0) + refundAmount,
  };

  // Deactivate + log out after a full refund of what's left refundable.
  if (refundAmount === refundableAmount) {
    update.is_active = false;
    update.sessions_valid_from = new Date().toISOString();
  }
  await db.from('members').update(update).eq('id', params.memberId);

  await logAudit((admin as { phone: string }).phone, 'member_refunded', 'member', params.memberId, {
    member: member.name,
    amount_paise: refundAmount,
    full_refund: refundAmount === refundableAmount,
    razorpay_refund_id: refund.id,
    reason: reason || null,
  }).catch(() => {});

  return NextResponse.json({ ok: true, refund_id: refund.id, amount: refund.amount });
}
