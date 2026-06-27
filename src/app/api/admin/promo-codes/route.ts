export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  return session && (session as { role: string }).role === 'admin'
    ? (session as { phone: string })
    : null;
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getServiceClient();
  const { data } = await db
    .from('promo_codes')
    .select('*')
    .order('created_at', { ascending: false });

  return NextResponse.json({ codes: data || [] });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code, discount_percent, max_uses, expires_at } = await req.json() as {
    code: string;
    discount_percent: number;
    max_uses?: number;
    expires_at?: string;
  };

  if (!code || !discount_percent) {
    return NextResponse.json({ error: 'Code and discount_percent required' }, { status: 400 });
  }
  if (discount_percent < 1 || discount_percent > 100) {
    return NextResponse.json({ error: 'Discount must be 1–100%' }, { status: 400 });
  }
  if (!/^[A-Z0-9_-]{3,20}$/.test(code.toUpperCase())) {
    return NextResponse.json({ error: 'Code must be 3–20 alphanumeric chars' }, { status: 400 });
  }

  const db = getServiceClient();
  const { error } = await db.from('promo_codes').insert({
    code: code.toUpperCase(),
    discount_percent,
    max_uses: max_uses ?? null,
    expires_at: expires_at ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.code === '23505' ? 'Code already exists' : 'Failed to create' }, { status: 400 });
  }

  logAudit(admin.phone, 'promo_code_created', 'promo_code', code.toUpperCase(), { discount_percent }).catch(() => {});
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, is_active } = await req.json() as { id: string; is_active: boolean };
  const db = getServiceClient();
  await db.from('promo_codes').update({ is_active }).eq('id', id);
  logAudit(admin.phone, is_active ? 'promo_code_enabled' : 'promo_code_disabled', 'promo_code', id).catch(() => {});
  return NextResponse.json({ ok: true });
}
