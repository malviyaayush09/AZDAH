export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  return session && (session as { role: string }).role === 'admin' ? session : null;
}

export async function POST(req: NextRequest, { params }: { params: { memberId: string } }) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const { action, days } = body as { action: 'freeze' | 'unfreeze'; days?: number };

  const db = getServiceClient();
  const { data: member } = await db
    .from('members')
    .select('id, plan_end, is_frozen, freeze_days')
    .eq('id', params.memberId)
    .single();

  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

  if (action === 'freeze') {
    if (member.is_frozen) return NextResponse.json({ error: 'Already frozen' }, { status: 400 });
    await db.from('members')
      .update({ is_frozen: true })
      .eq('id', params.memberId);
    return NextResponse.json({ ok: true, status: 'frozen' });
  }

  if (action === 'unfreeze') {
    if (!member.is_frozen) return NextResponse.json({ error: 'Not frozen' }, { status: 400 });
    if (!days || days < 1) return NextResponse.json({ error: 'Days required to extend on unfreeze' }, { status: 400 });

    // Extend plan_end by the frozen duration
    if (!member.plan_end) return NextResponse.json({ error: 'Member has no plan end date to extend' }, { status: 400 });
    const planEnd = new Date(member.plan_end + 'T00:00:00');
    planEnd.setDate(planEnd.getDate() + days);
    const newEnd = planEnd.toISOString().split('T')[0];

    await db.from('members')
      .update({
        is_frozen: false,
        plan_end: newEnd,
        freeze_days: (member.freeze_days ?? 0) + days,
      })
      .eq('id', params.memberId);

    return NextResponse.json({ ok: true, status: 'unfrozen', new_plan_end: newEnd });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
