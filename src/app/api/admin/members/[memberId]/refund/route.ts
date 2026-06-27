export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  return session && (session as { role: string }).role === 'admin' ? session : null;
}

export async function POST(req: NextRequest, { params }: { params: { memberId: string } }) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { amount_paise, reason } = await req.json() as { amount_paise?: number; reason?: string };

  const db = getServiceClient();
  const { data: member } = await db
    .from('members')
    .select('id, name, razorpay_payment_id, membership_plans(price_paise)')
    .eq('id', params.memberId)
    .single();

  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  if (!member.razorpay_payment_id) {
    return NextResponse.json({ error: 'No payment on file for this member' }, { status: 400 });
  }

  const planRaw = member.membership_plans;
  const plan = (Array.isArray(planRaw) ? planRaw[0] : planRaw) as { price_paise: number } | null;
  const refundAmount = amount_paise ?? plan?.price_paise;
  if (!refundAmount) {
    return NextResponse.json({ error: 'Could not determine refund amount' }, { status: 400 });
  }

  const rpKeyId = process.env.RAZORPAY_KEY_ID!;
  const rpKeySecret = process.env.RAZORPAY_KEY_SECRET!;

  const body: Record<string, unknown> = { amount: refundAmount };
  if (reason) body.notes = { reason };

  const res = await fetch(
    `https://api.razorpay.com/v1/payments/${member.razorpay_payment_id}/refund`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${rpKeyId}:${rpKeySecret}`)}`,
        'Content-Type': 'application/json',
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

  // Deactivate member after full refund
  if (!amount_paise || amount_paise === plan?.price_paise) {
    await db.from('members').update({ is_active: false }).eq('id', params.memberId);
  }

  return NextResponse.json({ ok: true, refund_id: refund.id, amount: refund.amount });
}
