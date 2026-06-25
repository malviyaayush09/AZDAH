export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySignature } from '@/lib/razorpay';
import { hashPassword, generatePassword } from '@/lib/auth';
import { sendMemberWelcome, sendAdminNewMember } from '@/lib/whatsapp';

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

  // 2. Fetch plan details
  const { data: plan } = await db
    .from('membership_plans')
    .select('id, name, duration_days, price_paise')
    .eq('id', planId)
    .single();

  if (!plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  }

  // 3. Calculate membership dates
  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + plan.duration_days);
  const toDate = (d: Date) => d.toISOString().split('T')[0];

  // 4. Generate password and hash it
  const rawPassword = generatePassword(8);
  const passwordHash = await hashPassword(rawPassword);

  // 5. Upsert member (handles duplicate phone — renews membership)
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
      },
      { onConflict: 'phone' }
    )
    .select('id')
    .single();

  if (memberError || !member) {
    console.error('Member upsert error:', memberError);
    return NextResponse.json({ error: 'Failed to activate membership' }, { status: 500 });
  }

  // 6. Send WhatsApp messages (fire & forget — don't block the response)
  Promise.all([
    sendMemberWelcome(phone, name, plan.name, rawPassword),
    sendAdminNewMember(name, phone, plan.name, plan.price_paise),
  ]).catch((err) => console.error('WhatsApp send error:', err));

  return NextResponse.json({ success: true, phone, name, password: rawPassword });
}
