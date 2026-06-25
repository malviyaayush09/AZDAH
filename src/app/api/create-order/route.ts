// export const runtime = 'edge'; // switched to nodejs for Razorpay compatibility

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { createOrder } from '@/lib/razorpay';

export async function POST(req: NextRequest) {
  const { planId, phone, name, email } = await req.json();

  if (!planId || !phone || !name) {
    return NextResponse.json({ error: 'planId, phone, and name required' }, { status: 400 });
  }

  const db = getServiceClient();

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

  // Create Razorpay order
  const receipt = `azdah_${phone}_${Date.now().toString(36)}`;
  let order: { id: string; amount: number; currency: string };
  try {
    order = await createOrder(plan.price_paise, receipt);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Razorpay order creation failed';
    console.error('Razorpay createOrder error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Store pending intent in DB
  await db.from('payment_intents').upsert({
    order_id: order.id,
    phone,
    name,
    email: email || null,
    plan_id: planId,
    status: 'pending',
  });

  return NextResponse.json({ orderId: order.id, amount: plan.price_paise });
}
