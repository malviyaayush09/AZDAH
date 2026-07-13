// Runs on Node.js default runtime (matches /api/create-order for Razorpay).

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { createOrder } from '@/lib/razorpay';
import { checkRateLimit, recordRequest } from '@/lib/rate-limit';
import { canonicalPhone } from '@/lib/phone';
import { todayIST } from '@/lib/date';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Creates a Razorpay order for a PAID workshop. The amount is read from the
// workshop row (server-authoritative) and stored on the payment_intent so
// verify-payment / the webhook can confirm the captured amount matches.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const { workshopId, name, phone, email } = body;

  if (!workshopId || !phone || !name) {
    return NextResponse.json({ error: 'workshopId, name and phone are required' }, { status: 400 });
  }
  if (!UUID.test(workshopId)) {
    return NextResponse.json({ error: 'Invalid workshopId' }, { status: 400 });
  }

  const trimmedName = String(name).trim();
  if (trimmedName.length < 3 || trimmedName.length > 80) return NextResponse.json({ error: 'Please enter your full name (3–80 characters).' }, { status: 400 });
  if (/\d/.test(trimmedName)) return NextResponse.json({ error: 'Name should not contain numbers.' }, { status: 400 });
  if (!/[A-Za-z]/.test(trimmedName)) return NextResponse.json({ error: 'Please enter a valid name.' }, { status: 400 });

  const phoneCanon = canonicalPhone(phone);
  if (!phoneCanon) return NextResponse.json({ error: 'Enter a valid 10-digit Indian mobile number.' }, { status: 400 });

  let emailClean: string | null = null;
  if (email != null && String(email).trim() !== '') {
    emailClean = String(email).trim();
    if (emailClean.length > 120 || !EMAIL.test(emailClean)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }
  }

  const rlKey = `wspay:${phoneCanon}`;
  if (await checkRateLimit(rlKey, 5, 60)) {
    return NextResponse.json({ error: 'Too many payment attempts. Try again later.' }, { status: 429 });
  }
  await recordRequest(rlKey);

  const db = getServiceClient();
  const today = todayIST();

  const { data: ws } = await db
    .from('workshops')
    .select('id, title, price_paise, is_active, workshop_date, capacity')
    .eq('id', workshopId)
    .single();

  if (!ws || !ws.is_active) return NextResponse.json({ error: 'Workshop not found' }, { status: 404 });
  if (ws.workshop_date < today) return NextResponse.json({ error: 'This workshop has already taken place.' }, { status: 400 });
  if (ws.price_paise <= 0) return NextResponse.json({ error: 'This workshop is free — no payment needed.' }, { status: 400 });

  // Soft pre-checks (final authority is register_workshop_atomic at verify time).
  const { data: existing } = await db
    .from('workshop_registrations')
    .select('id')
    .eq('workshop_id', workshopId)
    .eq('phone', phoneCanon)
    .eq('status', 'confirmed')
    .maybeSingle();
  if (existing) return NextResponse.json({ error: 'You are already registered for this workshop.' }, { status: 409 });

  const { count } = await db
    .from('workshop_registrations')
    .select('*', { count: 'exact', head: true })
    .eq('workshop_id', workshopId)
    .eq('status', 'confirmed');
  if ((count || 0) >= ws.capacity) return NextResponse.json({ error: 'This workshop is full.' }, { status: 400 });

  const receipt = `wsh_${phoneCanon}_${Date.now().toString(36)}`;
  let order: { id: string; amount: number; currency: string };
  try {
    order = await createOrder(ws.price_paise, receipt);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Razorpay order creation failed';
    console.error('Workshop createOrder error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  await db.from('payment_intents').upsert({
    order_id: order.id,
    phone: phoneCanon,
    name: trimmedName,
    email: emailClean,
    plan_id: null,
    workshop_id: workshopId,
    intent_type: 'workshop',
    amount_paise: ws.price_paise,
    status: 'pending',
  });

  return NextResponse.json({ orderId: order.id, amount: ws.price_paise, workshopTitle: ws.title });
}
