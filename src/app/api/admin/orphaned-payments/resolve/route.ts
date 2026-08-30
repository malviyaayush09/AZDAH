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

/**
 * Mark one orphaned membership payment as dealt with.
 *
 * The warning means money was captured and no member exists, so it clears
 * itself the moment either of those stops being true — the account gets
 * created, or the payment gets refunded. This is the third case: the studio
 * sorted it out some other way, usually by setting the member up under a
 * different number, and there is otherwise nothing that would ever quiet it.
 *
 * It hides the row, not the payment. The audit log keeps who did it and when,
 * because the money was real.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { order_id: orderId, note } = await req.json().catch(() => ({ order_id: null, note: null }));
  if (!orderId || typeof orderId !== 'string') {
    return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
  }

  const db = getServiceClient();
  const { data: intent } = await db
    .from('payment_intents')
    .select('order_id, name, phone, amount_paise')
    .eq('order_id', orderId)
    .single();
  if (!intent) return NextResponse.json({ error: 'No such order' }, { status: 404 });

  const { error } = await db
    .from('payment_intents')
    .update({ status: 'resolved' })
    .eq('order_id', orderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(admin.phone, 'orphan_payment_resolved', 'payment_intent', orderId, {
    name: intent.name,
    phone: intent.phone,
    amount_paise: intent.amount_paise,
    note: typeof note === 'string' ? note.slice(0, 200) : null,
  });

  return NextResponse.json({ success: true });
}
