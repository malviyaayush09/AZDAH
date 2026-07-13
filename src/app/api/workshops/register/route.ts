export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { checkRateLimit, recordRequest } from '@/lib/rate-limit';
import { canonicalPhone } from '@/lib/phone';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// FREE workshop registration (price_paise === 0). Paid workshops must go
// through create-order / verify-payment — this route refuses them so a paid
// workshop can't be claimed for free by calling it directly.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const { workshopId, name, phone, email } = body;

  if (!workshopId || !name || !phone) {
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

  const rlKey = `wsreg:${phoneCanon}`;
  if (await checkRateLimit(rlKey, 8, 60)) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
  }
  await recordRequest(rlKey);

  const db = getServiceClient();

  // Server-authoritative: confirm this workshop is actually free.
  const { data: ws } = await db
    .from('workshops')
    .select('id, price_paise, is_active')
    .eq('id', workshopId)
    .single();

  if (!ws || !ws.is_active) return NextResponse.json({ error: 'Workshop not found' }, { status: 404 });
  if (ws.price_paise !== 0) {
    return NextResponse.json({ error: 'This workshop requires payment.' }, { status: 400 });
  }

  const { data: result, error } = await db.rpc('register_workshop_atomic', {
    p_workshop_id: workshopId,
    p_name: trimmedName,
    p_phone: phoneCanon,
    p_email: emailClean,
    p_amount_paise: 0,
    p_payment_id: null,
    p_order_id: null,
  });

  if (error) return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  if (result === 'not_found') return NextResponse.json({ error: 'Workshop not found' }, { status: 404 });
  if (result === 'inactive') return NextResponse.json({ error: 'Registration is closed.' }, { status: 400 });
  if (result === 'past') return NextResponse.json({ error: 'This workshop has already taken place.' }, { status: 400 });
  if (result === 'already_registered') return NextResponse.json({ error: 'You are already registered for this workshop.' }, { status: 409 });
  if (result === 'full') return NextResponse.json({ error: 'This workshop is full.' }, { status: 400 });

  return NextResponse.json({ success: true });
}
