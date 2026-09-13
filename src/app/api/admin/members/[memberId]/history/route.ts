export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { todayIST } from '@/lib/date';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  return session && (session as { role: string }).role === 'admin' ? session : null;
}

type ClassRow = {
  id: string; title: string | null; trainer_name: string | null;
  class_date: string; start_time: string; category: string | null; is_cancelled: boolean;
};

/**
 * One member's whole story, on one request.
 *
 * The studio could see who was booked into a class and what a member holds
 * today, but never what had happened to them over time. So every question that
 * began "what did she actually book in August" ended with the studio asking
 * us, and a member arguing about a class they believed they never used could
 * not be answered at all.
 *
 * Everything here was already being recorded. None of it needed backfilling --
 * it simply had no screen.
 *
 * Two counting rules are carried over from lib/pack rather than reinvented, or
 * the numbers here would contradict the ones the member sees:
 *
 *   · a booking left 'rescheduled' does NOT spend a class -- its replacement
 *     is counted instead
 *   · a class the STUDIO cancelled does not spend one either, whatever the
 *     booking row says
 *
 * "Lost to expiry" is the number that does not exist anywhere else: classes
 * that were paid for, never used, and are now past their pack's end date. It
 * is the honest version of what a member means by "I lost my classes".
 */
export async function GET(req: NextRequest, { params }: { params: { memberId: string } }) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getServiceClient();
  const today = todayIST();

  const { data: member } = await db
    .from('members')
    .select('id, name, phone, email, created_at, plan_start, plan_end, is_active, is_frozen, freeze_days, reschedule_used_this_month')
    .eq('id', params.memberId)
    .single();

  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

  const [{ data: packRows }, { data: bookingRows }, { data: waitRows }] = await Promise.all([
    db.from('member_packs')
      .select('id, plan_name, classes_included, category_limits, starts_on, expires_on, is_frozen, amount_paid_paise, razorpay_payment_id, created_at')
      .eq('member_id', params.memberId)
      .order('created_at', { ascending: false }),
    db.from('bookings')
      .select('id, class_id, status, attended, pack_id, rescheduled_from, created_at')
      .eq('member_id', params.memberId),
    db.from('waitlist')
      .select('class_id, created_at')
      .eq('member_id', params.memberId),
  ]);

  const packs = packRows || [];
  const bookings = bookingRows || [];
  const waits = waitRows || [];

  // Every class either side of this member's history, in one query rather than
  // one per booking.
  const classIds = Array.from(new Set([
    ...bookings.map((b) => b.class_id as string),
    ...waits.map((w) => w.class_id as string),
  ].filter(Boolean)));

  const { data: classRows } = classIds.length
    ? await db.from('classes')
        .select('id, title, trainer_name, class_date, start_time, category, is_cancelled')
        .in('id', classIds)
    : { data: [] as ClassRow[] };

  const classById = new Map<string, ClassRow>();
  for (const c of (classRows || []) as ClassRow[]) classById.set(c.id, c);

  const packNameById = new Map<string, string>();
  for (const p of packs) packNameById.set(p.id as string, ((p.plan_name as string) || '').trim());

  /** Does this booking spend a class? The same test lib/pack counts by. */
  const spends = (b: { status: string; class_id: string }) => {
    const cls = classById.get(b.class_id);
    if (cls?.is_cancelled) return false;
    return b.status === 'confirmed' || b.status === 'cancelled';
  };

  // ── Packs, each with what was used and what was thrown away ───────────────
  const usedByPack = new Map<string, number>();
  for (const b of bookings) {
    if (!b.pack_id || !spends(b as { status: string; class_id: string })) continue;
    usedByPack.set(b.pack_id as string, (usedByPack.get(b.pack_id as string) || 0) + 1);
  }

  let totalPaidPaise = 0;
  let totalBought = 0;
  let totalUsed = 0;
  let totalLost = 0;

  /*
   * One payment can have produced more than one pack row -- it happened once,
   * on 31 August, to a member who is already the subject of a nervous
   * conversation. Count the money once per payment reference so a duplicate
   * never inflates what a member appears to have spent.
   *
   * Which row keeps the amount matters. Simply crediting the first row seen
   * and zeroing the rest reported that member as having paid NOTHING, because
   * the duplicate carried no amount and happened to sort first. So the row
   * holding the LARGEST recorded amount is the one that keeps it. Same rule as
   * the revenue report, which had to learn this the same way.
   */
  const amountCarrier = new Map<string, string>();   // payment reference -> pack id
  for (const p of packs) {
    const ref = p.razorpay_payment_id as string | null;
    if (!ref) continue;
    const held = amountCarrier.get(ref);
    const mine = (p.amount_paid_paise as number | null) ?? 0;
    const theirs = held
      ? ((packs.find((q) => q.id === held)?.amount_paid_paise as number | null) ?? 0)
      : -1;
    if (mine > theirs) amountCarrier.set(ref, p.id as string);
  }

  const packHistory = packs.map((p) => {
    const included = p.classes_included as number | null;
    const used = usedByPack.get(p.id as string) || 0;
    const remaining = included == null ? null : Math.max(0, included - used);
    const expired = (p.expires_on as string) < today;
    const notStarted = (p.starts_on as string) > today;
    // Only a pack that is actually finished can have lost anything. A live one
    // still has time on it.
    const lost = expired && remaining != null ? remaining : 0;

    const payRef = (p.razorpay_payment_id as string | null) || null;
    const amount = payRef && amountCarrier.get(payRef) !== p.id
      ? 0
      : (p.amount_paid_paise as number | null) ?? 0;

    totalPaidPaise += amount;
    if (included != null) { totalBought += included; totalUsed += used; totalLost += lost; }

    return {
      id: p.id,
      name: ((p.plan_name as string) || '').trim(),
      bought_on: p.created_at,
      amount_paise: amount,
      classes_included: included,
      used,
      remaining,
      lost_to_expiry: lost,
      starts_on: p.starts_on,
      expires_on: p.expires_on,
      is_frozen: p.is_frozen,
      state: notStarted ? 'upcoming' : expired ? 'expired' : 'live',
    };
  });

  // ── Everything that happened, newest first ────────────────────────────────
  const timeline = bookings.map((b) => {
    const cls = classById.get(b.class_id as string);
    const studioCancelled = !!cls?.is_cancelled;
    // 'rescheduled' is the DB's word for a booking whose class was given back.
    // Nobody outside the code calls it that, and printing it raw has confused
    // the studio before.
    const outcome =
      studioCancelled ? 'studio_cancelled'
      : b.status === 'rescheduled' ? 'moved_away'
      : b.status === 'cancelled' ? 'cancelled'
      : (cls && `${cls.class_date}T${cls.start_time}` < `${today}T00:00:00`)
        ? (b.attended === true ? 'attended' : b.attended === false ? 'missed' : 'past')
      : 'booked';

    return {
      id: b.id,
      class_id: b.class_id,
      title: (cls?.title || '').trim() || 'Class',
      trainer: (cls?.trainer_name || '').trim() || null,
      category: cls?.category ?? null,
      class_date: cls?.class_date ?? null,
      start_time: cls?.start_time ?? null,
      booked_on: b.created_at,
      outcome,
      spent_a_class: spends(b as { status: string; class_id: string }),
      paid_by: b.pack_id ? packNameById.get(b.pack_id as string) ?? null : null,
      // Set only by the reschedule route, so its presence is proof this
      // booking is where a moved class landed.
      came_from_reschedule: !!b.rescheduled_from,
    };
  });

  const waitlist = waits.map((w) => {
    const cls = classById.get(w.class_id as string);
    return {
      class_id: w.class_id,
      title: (cls?.title || '').trim() || 'Class',
      class_date: cls?.class_date ?? null,
      start_time: cls?.start_time ?? null,
      joined_on: w.created_at,
      // A row left against a class that has already happened. Nothing clears
      // these, so the studio should not read them as someone still waiting.
      is_past: !!cls && cls.class_date < today,
    };
  });

  timeline.sort((a, b) =>
    `${b.class_date ?? ''}${b.start_time ?? ''}`.localeCompare(`${a.class_date ?? ''}${a.start_time ?? ''}`));

  const count = (o: string) => timeline.filter((t) => t.outcome === o).length;

  return NextResponse.json({
    member: {
      ...member,
      member_since: member.created_at,
    },
    totals: {
      paid_rupees: Math.round(totalPaidPaise / 100),
      packs_bought: packs.length,
      classes_bought: totalBought,
      classes_used: totalUsed,
      classes_lost_to_expiry: totalLost,
      attended: count('attended'),
      missed: count('missed'),
      cancelled: count('cancelled'),
      moved: count('moved_away'),
      studio_cancelled: count('studio_cancelled'),
      upcoming: count('booked'),
      waitlisted_now: waitlist.filter((w) => !w.is_past).length,
    },
    packs: packHistory,
    timeline,
    waitlist,
  });
}
