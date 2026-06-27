export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const { code, planId } = await req.json() as { code: string; planId: string };

  if (!code || !planId) {
    return NextResponse.json({ error: 'Code and planId required' }, { status: 400 });
  }

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
