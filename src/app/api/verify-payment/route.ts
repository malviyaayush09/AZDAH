// Runs on the Node.js default runtime — the Razorpay confirmation fetch below
// gets HTTP 406 from the edge runtime, which silently downgraded this route to
// signature-only verification (same reason /api/create-order was moved).

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySignature } from '@/lib/razorpay';
import { hashPassword, generatePassword } from '@/lib/auth';
import { sendMemberWelcome, sendAdminNewMember } from '@/lib/whatsapp';
import { logError } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  // NOTE: planId/name/phone/email are intentionally NOT read from the client.
  // They are taken from the server-stored payment_intent so a client cannot
  // pay for a cheap plan and provision an expensive one (or spoof identity).
  const { orderId, paymentId, signature } = body;

  if (!orderId || !paymentId || !signature) {
    return NextResponse.json({ error: 'Missing payment fields' }, { status: 400 });
  }

  // 1. Verify Razorpay signature — the cryptographic gate. A valid signature
  //    can only come from Razorpay's checkout success callback.
  const valid = await verifySignature(orderId, paymentId, signature);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
  }

  const db = getServiceClient();

  // 2. Idempotency — reject if this payment already provisioned a member.
  const { data: already } = await db
    .from('members')
    .select('id')
    .eq('razorpay_payment_id', paymentId)
    .maybeSingle();
  if (already) {
    return NextResponse.json({ error: 'Payment already processed' }, { status: 409 });
  }

  // 3. Atomically CLAIM the pending intent (pending -> completed). Only one
  //    caller can win this transition, which prevents the verify-payment vs.
  //    webhook double-provision race. The intent is the source of truth for
  //    plan / identity / expected amount.
  const { data: intent } = await db
    .from('payment_intents')
    .update({ status: 'completed' })
    .eq('order_id', orderId)
    .eq('status', 'pending')
    .eq('intent_type', 'membership') // never claim a workshop intent here
    .select('plan_id, phone, name, email, amount_paise')
    .maybeSingle();
  if (!intent) {
    return NextResponse.json({ error: 'Order not found or already used' }, { status: 400 });
  }
  const revertIntent = () =>
    db.from('payment_intents').update({ status: 'pending' }).eq('order_id', orderId);

  // 4. Confirm with Razorpay that the payment is captured, matches the order,
  //    AND matches the amount we expected. Authoritative when reachable; if the
  //    API is down we fall back to the signature (which already proves success)
  //    plus the intent-bound amount.
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
      const rpPayment = await rpRes.json() as { status: string; amount: number; order_id: string };
      if (rpPayment.status !== 'captured' && rpPayment.status !== 'authorized') {
        await revertIntent();
        return NextResponse.json({ error: 'Payment not completed' }, { status: 400 });
      }
      if (rpPayment.order_id !== orderId) {
        await revertIntent();
        return NextResponse.json({ error: 'Payment order mismatch' }, { status: 400 });
      }
      if (intent.amount_paise != null && rpPayment.amount !== intent.amount_paise) {
        await revertIntent();
        return NextResponse.json({ error: 'Payment amount mismatch' }, { status: 400 });
      }
    } else {
      console.warn('[verify-payment] Razorpay API returned', rpRes.status, '— proceeding on signature');
    }
  } catch (e) {
    console.warn('[verify-payment] Razorpay API unreachable — proceeding on signature', e);
  }

  // 5. Fetch plan by the INTENT's plan_id (never the client's).
  const { data: plan } = await db
    .from('membership_plans')
    .select('id, name, duration_days, price_paise, classes_included, allowed_categories, category_limits')
    .eq('id', intent.plan_id)
    .single();
  if (!plan) {
    await revertIntent();
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  }

  const phone = intent.phone as string;
  const name = intent.name as string;
  const email = (intent.email as string | null) || null;

  // 6. Calculate membership dates
  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + plan.duration_days);
  const toDate = (d: Date) => d.toISOString().split('T')[0];

  // 7. New member, or an existing one buying another pack?
  //
  // This used to be a single upsert on phone, which meant a second purchase
  // silently replaced the member's password_hash, cleared must_change_password
  // and reset their reschedule counter — logging them out of an account they
  // already had. An existing buyer must keep everything except the new pack.
  const { data: existing } = await db
    .from('members')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  const isNewMember = !existing;
  let memberId: string;
  let rawPassword: string | null = null;

  if (isNewMember) {
    rawPassword = generatePassword(8);
    const passwordHash = await hashPassword(rawPassword);
    const { data: created, error: createErr } = await db
      .from('members')
      .insert({
        phone,
        name,
        email,
        password_hash: passwordHash,
        is_active: true,
        razorpay_payment_id: paymentId,
        razorpay_order_id: orderId,
        reschedule_used_this_month: false,
        reschedule_reset_date: toDate(startDate).slice(0, 7) + '-01',
        must_change_password: true,
        expiry_reminder_sent: false,
      })
      .select('id')
      .single();

    if (createErr || !created) {
      logError(createErr, { path: '/api/verify-payment', context: 'member_insert' });
      await revertIntent(); // allow the webhook / a retry to re-process this payment
      return NextResponse.json({ error: 'Failed to activate membership' }, { status: 500 });
    }
    memberId = created.id;
  } else {
    memberId = existing.id;
    // Deliberately NOT touched: password_hash, must_change_password,
    // reschedule_used_this_month, reschedule_reset_date. Buying a pack is not
    // a reason to log somebody out or hand back their monthly reschedule.
    const { error: updErr } = await db
      .from('members')
      .update({
        name,
        email,
        is_active: true,
        expiry_reminder_sent: false,
        razorpay_payment_id: paymentId,
        razorpay_order_id: orderId,
      })
      .eq('id', memberId);
    if (updErr) {
      logError(updErr, { path: '/api/verify-payment', context: 'member_update' });
      await revertIntent();
      return NextResponse.json({ error: 'Failed to activate membership' }, { status: 500 });
    }
  }

  // 8. Record the pack itself. plan_name / classes_included / allowed_categories
  //    are snapshots: editing the plan later must not change what somebody
  //    already bought.
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
    logError(packErr, { path: '/api/verify-payment', context: 'member_pack_insert' });
    await revertIntent();
    return NextResponse.json({ error: 'Failed to activate membership' }, { status: 500 });
  }

  // 9. Point members.plan_* at the PRIMARY pack — the one expiring last — not
  //    blindly at whatever was just bought. Otherwise buying a short pack drags
  //    plan_end backwards and locks the member out of a longer one they hold.
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

  // 10. WhatsApp (fire & forget). Only a genuinely new member gets credentials;
  //     sending a password to somebody who already has one is both wrong and
  //     alarming.
  const notify: Promise<unknown>[] = [sendAdminNewMember(name, phone, plan.name, plan.price_paise)];
  if (isNewMember && rawPassword) notify.push(sendMemberWelcome(phone, name, plan.name, rawPassword));
  Promise.all(notify).catch((err) => console.error('WhatsApp send error:', err));

  return NextResponse.json({
    success: true,
    phone,
    name,
    password: rawPassword,          // null when they already had an account
    is_new_member: isNewMember,
    plan_end: toDate(endDate),
  });
}
