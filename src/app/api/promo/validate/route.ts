export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { checkRateLimit, recordRequest } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const { code, planId } = body as { code: string; planId: string };

  if (!code || !planId) {
    return NextResponse.json({ error: 'Code and planId required' }, { status: 400 });
  }

  // Unauthenticated endpoint — without a limit, promo codes can be brute-forced
  // by guessing until one validates.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const rlKey = `promo:${ip}`;
  if (await checkRateLimit(rlKey, 10, 60)) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
  }
  await recordRequest(rlKey);

  const db = getServiceClient();
  const { data: promo } = await db
    .from('promo_codes')
    .select('id, code, discount_percent, max_uses, uses_count, expires_at, is_active')
    .eq('code', code.toUpperCase().trim())
    .single();

  if (!promo || !promo.is_active) {
    return NextResponse.json({ error: 'Invalid or expired promo code' }, { status: 400 });
  }

  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Promo code has expired' }, { status: 400 });
  }

  if (promo.max_uses !== null && promo.uses_count >= promo.max_uses) {
    return NextResponse.json({ error: 'Promo code usage limit reached' }, { status: 400 });
  }

  return NextResponse.json({
    valid: true,
    discount_percent: promo.discount_percent,
    code: promo.code,
  });
}
