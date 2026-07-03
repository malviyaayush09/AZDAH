export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { hashPassword, generatePassword } from '@/lib/auth';
import { sendMemberWelcome, sendAdminNewMember } from '@/lib/whatsapp';

async function verifyWebhookSignature(body: string, signature: string): Promise<boolean> {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const computed = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  // Constant-time comparison.
  if (computed.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-razorpay-signature') ?? '';
  const body = await req.text();

  // Verify webhook authenticity
  const valid = await verifyWebhookSignature(body, signature);
  if (!valid) {
    console.error('Invalid Razorpay webhook signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: { event: string; payload: { payment: { entity: { id: string; order_id: string; amount: number; contact: string; notes?: { name?: string; email?: string; plan_id?: string } } } } };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Only handle successful payments
  if (event.event !== 'payment.captured') {
    return NextResponse.json({ received: true });
  }

  const payment = event.payload.payment.entity;
  const paymentId = payment.id;
  const orderId = payment.order_id;
  const phone = payment.contact?.replace(/\D/g, '') ?? '';

  const db = getServiceClient();

  // Idempotency — skip if already processed
  const { data: already } = await db
    .from('members')
    .select('id')
    .eq('razorpay_payment_id', paymentId)
    .maybeSingle();
  if (already) return NextResponse.json({ received: true });

  // Atomically claim the pending intent (pending -> completed) so the webhook
  // and the verify-payment path can't both provision the same payment.
  const { data: intent } = await db
    .from('payment_intents')
    .update({ status: 'completed' })
    .eq('order_id', orderId)
    .eq('status', 'pending')
    .select('plan_id, phone, name, email, amount_paise')
    .maybeSingle();

  if (!intent) {
    // Already processed (verify-payment or a prior webhook) or unknown order.
    return NextResponse.json({ received: true });
  }

  // Confirm the captured amount matches what we expected for this order.
  if (intent.amount_paise != null && payment.amount !== intent.amount_paise) {
    await db.from('payment_intents').update({ status: 'pending' }).eq('order_id', orderId);
    console.error('Webhook: amount mismatch for order', orderId);
    return NextResponse.json({ received: true });
  }

  const { data: plan } = await db
    .from('membership_plans')
    .select('id, name, duration_days, price_paise')
    .eq('id', intent.plan_id)
    .single();

  if (!plan) {
    await db.from('payment_intents').update({ status: 'pending' }).eq('order_id', orderId);
    return NextResponse.json({ received: true });
  }

  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + plan.duration_days);
  const toDate = (d: Date) => d.toISOString().split('T')[0];

  const rawPassword = generatePassword(8);
  const passwordHash = await hashPassword(rawPassword);

  const { error } = await db.from('members').upsert(
    {
      phone: intent.phone || phone,
      name: intent.name,
      email: intent.email || null,
      password_hash: passwordHash,
      plan_id: intent.plan_id,
      plan_start: toDate(startDate),
      plan_end: toDate(endDate),
      is_active: true,
      razorpay_payment_id: paymentId,
      razorpay_order_id: orderId,
      reschedule_used_this_month: false,
      reschedule_reset_date: toDate(startDate).slice(0, 7) + '-01',
      must_change_password: true,
      expiry_reminder_sent: false,
    },
    { onConflict: 'phone' }
  );

  if (error) {
    console.error('Webhook: member upsert failed', error);
    await db.from('payment_intents').update({ status: 'pending' }).eq('order_id', orderId);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }

  // Send WhatsApp
  Promise.all([
    sendMemberWelcome(intent.phone || phone, intent.name, plan.name, rawPassword),
    sendAdminNewMember(intent.name, intent.phone || phone, plan.name, plan.price_paise),
  ]).catch((err) => console.error('Webhook WhatsApp error:', err));

  return NextResponse.json({ received: true });
}
