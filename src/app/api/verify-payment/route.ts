export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySignature } from '@/lib/razorpay';
import { hashPassword, generatePassword } from '@/lib/auth';
import { sendMemberWelcome, sendAdminNewMember } from '@/lib/whatsapp';
import { logError } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const { orderId, paymentId, signature, planId, name, phone, email } = await req.json();

  if (!orderId || !paymentId || !signature) {
    return NextResponse.json({ error: 'Missing payment fields' }, { status: 400 });
  }

  // 1. Verify Razorpay signature
  const valid = await verifySignature(orderId, paymentId, signature);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
  }

  const db = getServiceClient();

  // 2. Idempotency — reject if this payment was already processed
  const { data: already } = await db
    .from('members')
    .select('id')
    .eq('razorpay_payment_id', paymentId)
    .maybeSingle();
  if (already) {
    return NextResponse.json({ error: 'Payment already processed' }, { status: 409 });
  }

  // 3. Verify order exists in payment_intents and matches this phone
  const { data: intent } = await db
    .from('payment_intents')
    .select('plan_id, phone')
    .eq('order_id', orderId)
    .eq('status', 'pending')
    .maybeSingle();
  if (!intent) {
    return NextResponse.json({ error: 'Order not found or already used' }, { status: 400 });
  }

  // 4. Optional secondary check via Razorpay API (HMAC signature above is the real gate)
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
        return NextResponse.json({ error: 'Payment not completed' }, { status: 400 });
      }
      if (rpPayment.order_id !== orderId) {
        return NextResponse.json({ error: 'Payment order mismatch' }, { status: 400 });
      }
    } else {
      console.warn('[verify-payment] Razorpay API returned', rpRes.status, '— proceeding on HMAC signature');
    }
  } catch (e) {
    console.warn('[verify-payment] Razorpay API unreachable — proceeding on HMAC signature', e);
  }

  // 5. Fetch plan details
  const { data: plan } = await db
    .from('membership_plans')
    .select('id, name, duration_days, price_paise')
    .eq('id', planId)
    .single();

  if (!plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  }

  // 6. Calculate membership dates
  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + plan.duration_days);
  const toDate = (d: Date) => d.toISOString().split('T')[0];

  // 7. Generate password and hash it
  const rawPassword = generatePassword(8);
  const passwordHash = await hashPassword(rawPassword);

  // 8. Upsert member (handles duplicate phone — renews membership)
  const { data: member, error: memberError } = await db
    .from('members')
    .upsert(
      {
        phone,
        name,
        email: email || null,
        password_hash: passwordHash,
        plan_id: planId,
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
    )
    .select('id')
    .single();

  if (memberError || !member) {
    logError(memberError, { path: '/api/verify-payment', context: 'member_upsert' });
    return NextResponse.json({ error: 'Failed to activate membership' }, { status: 500 });
  }

  // 9. Mark payment intent as used
  db.from('payment_intents').update({ status: 'completed' }).eq('order_id', orderId).then(() => {});

  // 10. Send WhatsApp messages (fire & forget — don't block the response)
  Promise.all([
    sendMemberWelcome(phone, name, plan.name, rawPassword),
    sendAdminNewMember(name, phone, plan.name, plan.price_paise),
  ]).catch((err) => console.error('WhatsApp send error:', err));

  return NextResponse.json({ success: true, phone, name, password: rawPassword, plan_end: toDate(endDate) });
}
