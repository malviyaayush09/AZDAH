export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { todayIST } from '@/lib/date';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  return session && (session as { role: string }).role === 'admin' ? session : null;
}

/**
 * Move a pack's expiry date out.
 *
 * The studio publishes classes in cycles, and a cycle regularly runs past the
 * date a member's pack ends. A member with a class still unspent then cannot
 * book it -- the pack is valid on the day they are booking but not on the day
 * of the class -- and the studio had no way to give it to them. The only
 * existing lever was Unfreeze, which moved members.plan_end and left the pack
 * untouched, so it changed the date on screen without changing what could be
 * booked.
 *
 * Booking is gated on member_packs.expires_on (see allowedCategoriesUnion and
 * the pack coverage check), so that is the column this writes. members.plan_end
 * is then recomputed from the packs rather than set directly, because it means
 * "the furthest date any pack of theirs reaches" and must not be edited into
 * disagreeing with them.
 */
export async function POST(req: NextRequest, { params }: { params: { memberId: string } }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

  const packId = typeof body.packId === 'string' ? body.packId : '';
  const newExpiresOn = typeof body.newExpiresOn === 'string' ? body.newExpiresOn : '';

  if (!packId || !/^\d{4}-\d{2}-\d{2}$/.test(newExpiresOn)) {
    return NextResponse.json(
      { error: 'A pack and a new end date (YYYY-MM-DD) are both required.' },
      { status: 400 },
    );
  }

  const db = getServiceClient();

  // Scoped to the member in the URL, so a pack id from one member cannot be
  // extended through another member's row.
  const { data: pack } = await db
    .from('member_packs')
    .select('id, member_id, plan_name, starts_on, expires_on')
    .eq('id', packId)
    .eq('member_id', params.memberId)
    .single();

  if (!pack) {
    return NextResponse.json({ error: 'That pack does not belong to this member.' }, { status: 404 });
  }

  // Only ever forwards. Pulling an expiry date backwards would strand classes
  // the member has already booked beyond the new date, and is a different and
  // far riskier action than the one this exists for.
  if (newExpiresOn <= pack.expires_on) {
    return NextResponse.json(
      {
        error: `This pack already runs to ${pack.expires_on}. Pick a later date — this only moves an end date forward.`,
      },
      { status: 400 },
    );
  }

  const { error: updErr } = await db
    .from('member_packs')
    .update({ expires_on: newExpiresOn })
    .eq('id', packId);
  if (updErr) {
    return NextResponse.json({ error: 'Could not extend the pack. Please try again.' }, { status: 500 });
  }

  // plan_end is a summary of the packs, so read them back and take the furthest
  // rather than assuming this pack is now the latest -- a member can hold a
  // longer Mobility pack than the Pole one being extended.
  const { data: allPacks } = await db
    .from('member_packs')
    .select('expires_on')
    .eq('member_id', params.memberId);

  const furthest = (allPacks || [])
    .map((p) => p.expires_on as string)
    .sort()
    .slice(-1)[0];

  if (furthest) {
    await db
      .from('members')
      // A member whose pack now reaches a future date is active again; an
      // expired pack is the usual reason is_active was turned off.
      .update({ plan_end: furthest, is_active: furthest >= todayIST() ? true : undefined })
      .eq('id', params.memberId);
  }

  const { data: member } = await db
    .from('members')
    .select('name')
    .eq('id', params.memberId)
    .single();

  await logAudit(
    (admin as { phone: string }).phone,
    'pack_extended',
    'member_pack',
    packId,
    {
      member: member?.name?.trim(),
      pack_name: pack.plan_name?.trim(),
      was_expiring: pack.expires_on,
      now_expires: newExpiresOn,
      plan_end: furthest ?? null,
    },
  ).catch(() => {});

  return NextResponse.json({
    ok: true,
    pack_name: pack.plan_name?.trim() ?? null,
    was_expiring: pack.expires_on,
    now_expires: newExpiresOn,
    plan_end: furthest ?? null,
  });
}
