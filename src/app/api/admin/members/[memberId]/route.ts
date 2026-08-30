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
 * Delete a member outright — but only one with nothing worth keeping.
 *
 * Real members carry booking history and payment records the studio needs at
 * the end of the year, so those can only ever be deactivated. This exists for
 * the entries that should never have been there: test signups, duplicates,
 * mistyped numbers. Anything with a booking or a payment against it is
 * refused, so there is no way to lose history by clicking the wrong row.
 */
export async function DELETE(req: NextRequest, { params }: { params: { memberId: string } }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getServiceClient();
  const { data: member } = await db
    .from('members')
    .select('id, name, phone, razorpay_payment_id')
    .eq('id', params.memberId)
    .single();
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

  const { count: bookings } = await db
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', params.memberId);
  if (bookings) {
    return NextResponse.json({
      error: `${member.name} has ${bookings} booking${bookings === 1 ? '' : 's'} on record. Deactivate instead — deleting would take the class history with it.`,
    }, { status: 409 });
  }
  if (member.razorpay_payment_id) {
    return NextResponse.json({
      error: `${member.name} has a payment on record. Deactivate instead — the revenue history has to stay.`,
    }, { status: 409 });
  }

  // Packs and waitlist rows are this member's alone and carry nothing the
  // studio reports on, so they go with them.
  await db.from('waitlist').delete().eq('member_id', params.memberId);
  await db.from('member_packs').delete().eq('member_id', params.memberId);
  const { error } = await db.from('members').delete().eq('id', params.memberId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Awaited, unlike most call sites: on a delete the record is the only trace
  // left, so losing it to a cancelled edge invocation would be the whole point.
  await logAudit(admin.phone, 'member_deleted', 'member', params.memberId, {
    name: member.name, phone: member.phone,
  });

  return NextResponse.json({ success: true, name: member.name });
}

export async function PATCH(req: NextRequest, { params }: { params: { memberId: string } }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { is_active } = await req.json();
  if (typeof is_active !== 'boolean') {
    return NextResponse.json({ error: 'is_active must be a boolean' }, { status: 400 });
  }
  const db = getServiceClient();
  // Deactivating must also revoke live sessions — tokens last 7 days, so
  // without this a deactivated member stayed logged in.
  const patch: Record<string, unknown> = { is_active };
  if (!is_active) patch.sessions_valid_from = new Date().toISOString();
  const { error } = await db.from('members').update(patch).eq('id', params.memberId);
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  await logAudit(admin.phone, is_active ? 'member_activated' : 'member_deactivated', 'member', params.memberId).catch(() => {});
  return NextResponse.json({ success: true });
}
