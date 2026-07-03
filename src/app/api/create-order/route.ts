// export const runtime = 'edge'; // switched to nodejs for Razorpay compatibility

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { createOrder } from '@/lib/razorpay';
import { checkRateLimit, recordRequest } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const { planId, phone, name, email, promoCode } = body;

  if (!planId || !phone || !name) {
    return NextResponse.json({ error: 'planId, phone, and name required' }, { status: 400 });
  }

  // Phone format validation
  const cleanPhone = String(phone).trim().replace(/\D/g, '');
  if (!/^\d{10,15}$/.test(cleanPhone)) {
    return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
  }

  // planId must be a UUID
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planId)) {
    return NextResponse.json({ error: 'Invalid planId' }, { status: 400 });
  }

  // Rate limit: max 5 payment attempts per phone per hour
  const rlKey = `payment:${cleanPhone}`;
  if (await checkRateLimit(rlKey, 5, 60)) {
    return NextResponse.json({ error: 'Too many payment attempts. Try again later.' }, { status: 429 });
  }
  await recordRequest(rlKey);

  const db = getServiceClient();

  // Name validation
  const trimmedName = name.trim();
  if (trimmedName.length < 3) {
    return NextResponse.json({ error: 'Please enter your full name (at least 3 characters).' }, { status: 400 });
  }
  if (/\d/.test(trimmedName)) {
    return NextResponse.json({ error: 'Name should not contain numbers.' }, { status: 400 });
  }

  // Duplicate active member check
  const { data: existingMember } = await db
    .from('members')
    .select('id, plan_end, is_active')
    .eq('phone', phone)
    .maybeSingle();

  if (existingMember) {
    const planEnd = new Date(existingMember.plan_end);
    if (planEnd > new Date() && existingMember.is_active) {
      return NextResponse.json({ error: 'already_member' }, { status: 409 });
    }
  }

  // Fetch plan
  const { data: plan } = await db
    .from('membership_plans')
    .select('id, name, price_paise')
    .eq('id', planId)
    .eq('is_active', true)
    .single();

  if (!plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  }

  // Validate promo code if provided
  let discountPercent = 0;
  let validatedPromo: string | null = null;
  if (promoCode) {
    const { data: promo } = await db
      .from('promo_codes')
      .select('id, discount_percent, max_uses, uses_count, expires_at, is_active')
      .eq('code', String(promoCode).toUpperCase().trim())
      .single();

    if (promo && promo.is_active &&
        (!promo.expires_at || new Date(promo.expires_at) > new Date()) &&
        (promo.max_uses === null || promo.uses_count < promo.max_uses)) {
      discountPercent = promo.discount_percent;
      validatedPromo = String(promoCode).toUpperCase().trim();
    }
  }

  const finalAmount = discountPercent > 0
    ? Math.round(plan.price_paise * (1 - discountPercent / 100))
    : plan.price_paise;

  // Create Razorpay order
  const receipt = `azdah_${phone}_${Date.now().toString(36)}`;
  let order: { id: string; amount: number; currency: string };
  try {
    order = await createOrder(finalAmount, receipt);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Razorpay order creation failed';
    console.error('Razorpay createOrder error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Increment promo uses — optimistic lock on uses_count AND enforce the cap
  // at write time so concurrent orders can't push uses_count past max_uses.
  if (validatedPromo) {
    const { data: p } = await db.from('promo_codes').select('uses_count, max_uses').eq('code', validatedPromo).single();
    if (p && (p.max_uses === null || p.uses_count < p.max_uses)) {
      await db.from('promo_codes')
        .update({ uses_count: p.uses_count + 1 })
        .eq('code', validatedPromo)
        .eq('uses_count', p.uses_count); // only updates if count hasn't changed since we last read
    }
  }

  // Store pending intent in DB — amount_paise is the server-authoritative price
  // that verify-payment will confirm against the actual captured payment.
  await db.from('payment_intents').upsert({
    order_id: order.id,
    phone,
    name,
    email: email || null,
    plan_id: planId,
    amount_paise: finalAmount,
    status: 'pending',
  });

  return NextResponse.json({
    orderId: order.id,
    amount: finalAmount,
    original_amount: plan.price_paise,
    discount_percent: discountPercent,
  });
}
