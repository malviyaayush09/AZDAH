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
    .select('plan_id, phone, name, email, amount_paise, workshop_id, intent_type')
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

  // Workshop payments register an attendee (not a member). This is the
  // fallback when the browser closed before /api/workshops/verify-payment ran.
  if (intent.intent_type === 'workshop' && intent.workshop_id) {
    const { error: regErr } = await db.rpc('register_workshop_atomic', {
      p_workshop_id: intent.workshop_id,
      p_name: intent.name,
      p_phone: intent.phone || phone,
      p_email: intent.email || null,
      p_amount_paise: intent.amount_paise ?? 0,
      p_payment_id: paymentId,
      p_order_id: orderId,
    });
    if (regErr) {
      await db.from('payment_intents').update({ status: 'pending' }).eq('order_id', orderId);
      console.error('Webhook: workshop registration failed', regErr);
      return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
    return NextResponse.json({ received: true });
  }

  const { data: plan } = await db
    .from('membership_plans')
    .select('id, name, duration_days, price_paise, classes_included, allowed_categories, category_limits')
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

  const memberPhone = intent.phone || phone;

  // Same shape as verify-payment: a repeat buyer keeps their account. The old
  // upsert replaced password_hash here too, and on this branch the new password
  // is generated server-side and shown to nobody — so a second purchase could
  // lock a member out with no way to learn their new credentials.
  const { data: existing } = await db
    .from('members')
    .select('id')
    .eq('phone', memberPhone)
    .maybeSingle();

  const isNewMember = !existing;
  let memberId: string;
  let rawPassword: string | null = null;

  if (isNewMember) {
    rawPassword = generatePassword(8);
    const passwordHash = await hashPassword(rawPassword);
    const { data: created, error } = await db.from('members').insert({
      phone: memberPhone,
      name: intent.name,
      email: intent.email || null,
      password_hash: passwordHash,
      is_active: true,
      razorpay_payment_id: paymentId,
      razorpay_order_id: orderId,
      reschedule_used_this_month: false,
      reschedule_reset_date: toDate(startDate).slice(0, 7) + '-01',
      must_change_password: true,
      expiry_reminder_sent: false,
    }).select('id').single();

    if (error || !created) {
      console.error('Webhook: member insert failed', error);
      await db.from('payment_intents').update({ status: 'pending' }).eq('order_id', orderId);
      return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
    memberId = created.id;
  } else {
    memberId = existing.id;
    const { error } = await db.from('members').update({
      name: intent.name,
      email: intent.email || null,
      is_active: true,
      expiry_reminder_sent: false,
      razorpay_payment_id: paymentId,
      razorpay_order_id: orderId,
    }).eq('id', memberId);
    if (error) {
      console.error('Webhook: member update failed', error);
      await db.from('payment_intents').update({ status: 'pending' }).eq('order_id', orderId);
      return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
  }

  const { error: packErr } = await db.from('member_packs').insert({
    member_id: memberId,
    plan_id: plan.id,
    plan_name: plan.name,
    classes_included: plan.classes_included ?? null,
    allowed_categories: plan.allowed_categories ?? null,
    // Snapshotted like everything else here: a combo bought today keeps the
    // split it was sold with, even if the studio reprices the plan later.
    category_limits: plan.category_limits ?? null,
    starts_on: toDate(startDate),
    expires_on: toDate(endDate),
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    amount_paid_paise: (intent.amount_paise as number | null) ?? null,
  });
  if (packErr) {
    console.error('Webhook: member_pack insert failed', packErr);
    await db.from('payment_intents').update({ status: 'pending' }).eq('order_id', orderId);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }

  // plan_* names the pack expiring LAST, never simply the newest purchase.
  const { data: primary } = await db
    .from('member_packs')
    .select('plan_id, starts_on, expires_on')
    .eq('member_id', memberId)
    .order('expires_on', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (primary) {
    await db.from('members').update({
      plan_id: primary.plan_id,
      plan_start: primary.starts_on,
      plan_end: primary.expires_on,
    }).eq('id', memberId);
  }

  // Send WhatsApp. Credentials go only to a genuinely new member — an existing
  // one keeps the password they already have, so there is nothing to send.
  const notify: Promise<unknown>[] = [
    sendAdminNewMember(intent.name, memberPhone, plan.name, plan.price_paise),
  ];
  if (isNewMember && rawPassword) {
    notify.push(sendMemberWelcome(memberPhone, intent.name, plan.name, rawPassword));
  }
  Promise.all(notify).catch((err) => console.error('Webhook WhatsApp error:', err));

  return NextResponse.json({ received: true });
}
