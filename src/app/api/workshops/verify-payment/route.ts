export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySignature } from '@/lib/razorpay';
import { logError } from '@/lib/logger';

// Verifies a PAID workshop payment and registers the attendee. Server-
// authoritative: identity + amount come from the stored payment_intent, never
// the client. Mirrors /api/verify-payment but registers for a workshop
// instead of provisioning a member.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const { orderId, paymentId, signature } = body;

  if (!orderId || !paymentId || !signature) {
    return NextResponse.json({ error: 'Missing payment fields' }, { status: 400 });
  }

  // 1. Verify Razorpay signature — the cryptographic gate.
  const valid = await verifySignature(orderId, paymentId, signature);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
  }

  const db = getServiceClient();

  // 2. Idempotency — this payment may already be registered (webhook or retry).
  const { data: already } = await db
    .from('workshop_registrations')
    .select('id')
    .eq('razorpay_payment_id', paymentId)
    .maybeSingle();
  if (already) return NextResponse.json({ success: true });

  // 3. Atomically CLAIM the pending workshop intent (pending -> completed).
  const { data: intent } = await db
    .from('payment_intents')
    .update({ status: 'completed' })
    .eq('order_id', orderId)
    .eq('status', 'pending')
    .eq('intent_type', 'workshop')
    .select('workshop_id, phone, name, email, amount_paise')
    .maybeSingle();
  if (!intent || !intent.workshop_id) {
    return NextResponse.json({ error: 'Order not found or already used' }, { status: 400 });
  }
  const revertIntent = () =>
    db.from('payment_intents').update({ status: 'pending' }).eq('order_id', orderId);

  // 4. Confirm capture + amount with Razorpay (authoritative when reachable).
  const rpKeyId = process.env.RAZORPAY_KEY_ID!;
  const rpKeySecret = process.env.RAZORPAY_KEY_SECRET!;
  try {
    const rpRes = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: {
        Authorization: `Basic ${btoa(`${rpKeyId}:${rpKeySecret}`)}`,
        Accept: 'application/json',
      },
    });
    if (rpRes.ok) {
      const rp = await rpRes.json() as { status: string; amount: number; order_id: string };
      if (rp.status !== 'captured' && rp.status !== 'authorized') {
        await revertIntent();
        return NextResponse.json({ error: 'Payment not completed' }, { status: 400 });
      }
      if (rp.order_id !== orderId) {
        await revertIntent();
        return NextResponse.json({ error: 'Payment order mismatch' }, { status: 400 });
      }
      if (intent.amount_paise != null && rp.amount !== intent.amount_paise) {
        await revertIntent();
        return NextResponse.json({ error: 'Payment amount mismatch' }, { status: 400 });
      }
    } else {
      console.warn('[workshop verify] Razorpay API returned', rpRes.status, '— proceeding on signature');
    }
  } catch (e) {
    console.warn('[workshop verify] Razorpay API unreachable — proceeding on signature', e);
  }

  // 5. Register (atomic capacity + dup guard).
  const { data: result, error } = await db.rpc('register_workshop_atomic', {
    p_workshop_id: intent.workshop_id,
    p_name: intent.name,
    p_phone: intent.phone,
    p_email: intent.email,
    p_amount_paise: intent.amount_paise ?? 0,
    p_payment_id: paymentId,
    p_order_id: orderId,
  });

  if (error) {
    logError(error, { path: '/api/workshops/verify-payment', context: 'register_atomic' });
    await revertIntent(); // let the webhook / a retry re-process
    return NextResponse.json({ error: 'Registration failed after payment. Please contact the studio.' }, { status: 500 });
  }
  if (result === 'already_registered') return NextResponse.json({ success: true });
  if (result === 'full') {
    // Rare race: paid but the last spot went first. Keep the intent 'completed'
    // (payment is captured and traceable) so the studio can refund manually.
    console.error('[workshop verify] full_after_payment order', orderId, 'payment', paymentId);
    return NextResponse.json({ success: false, error: 'full_after_payment' }, { status: 409 });
  }
  if (result !== 'ok') {
    await revertIntent();
    return NextResponse.json({ error: 'Registration failed' }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
