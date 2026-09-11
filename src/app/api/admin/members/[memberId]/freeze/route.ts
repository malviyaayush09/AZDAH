export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  return session && (session as { role: string }).role === 'admin' ? session : null;
}

export async function POST(req: NextRequest, { params }: { params: { memberId: string } }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    await logAudit((admin as { phone: string }).phone, 'membership_frozen', 'member', params.memberId).catch(() => {});
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

    // The packs have to move too. Booking is gated on member_packs.expires_on,
    // not on plan_end, so extending plan_end alone gave back the date on screen
    // and none of the booking it implies -- the member still could not book
    // past the original expiry. Every pack that was live at the point of
    // freezing gets the same number of days the member lost.
    const { data: packs } = await db
      .from('member_packs')
      .select('id, expires_on')
      .eq('member_id', params.memberId)
      .gte('expires_on', member.plan_end);

    const shifted: { id: string; from: string; to: string }[] = [];
    for (const p of packs || []) {
      const d = new Date((p.expires_on as string) + 'T00:00:00');
      d.setDate(d.getDate() + days);
      const to = d.toISOString().split('T')[0];
      await db.from('member_packs').update({ expires_on: to }).eq('id', p.id);
      shifted.push({ id: p.id as string, from: p.expires_on as string, to });
    }

    await db.from('members')
      .update({
        is_frozen: false,
        plan_end: newEnd,
        freeze_days: (member.freeze_days ?? 0) + days,
      })
      .eq('id', params.memberId);

    await logAudit((admin as { phone: string }).phone, 'membership_unfrozen', 'member', params.memberId, {
      days_extended: days, new_plan_end: newEnd, packs_extended: shifted,
    }).catch(() => {});
    return NextResponse.json({
      ok: true, status: 'unfrozen', new_plan_end: newEnd, packs_extended: shifted.length,
    });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
