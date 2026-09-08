export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { todayIST } from '@/lib/date';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  if (!session || (session as { role: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getServiceClient();
  // Studio's calendar day, not the server's UTC one — otherwise "today's
  // classes" is still showing yesterday until 05:30 IST.
  const today = todayIST();
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const ago30Days = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const [todayClassesRes, expiringRes, inactiveRes, todayAttendanceRes] = await Promise.all([
    // classes has no booked_count column — asking for one made PostgREST
    // reject the whole query, so the overview reported nought classes today
    // while the calendar beside it listed them. Counted from bookings below.
    db.from('classes')
      .select('id, title, start_time, end_time, capacity')
      .eq('class_date', today)
      .eq('is_cancelled', false)
      .order('start_time'),

    // plan_name and days_remaining are computed, not stored. Selecting them
    // failed the query outright and the panel showed nothing was expiring.
    db.from('members')
      .select('id, name, phone, plan_end, membership_plans(name)')
      .eq('is_active', true)
      .gte('plan_end', today)
      .lte('plan_end', in7Days)
      .order('plan_end'),

    // Same again: no plan_name column, so "no inactive members" was shown
    // while two sat deactivated.
    db.from('members')
      .select('id, name, phone, plan_end, created_at, membership_plans(name)')
      .eq('is_active', false)
      .order('created_at', { ascending: false })
      .limit(50),

    // Today's confirmed bookings count
    db.from('bookings')
      .select('id, attended, members(name), classes!inner(class_date, title, start_time)')
      .eq('status', 'confirmed')
      .eq('classes.class_date', today),
  ]);

  /**
   * Is the published schedule about to run out from under people's credits?
   *
   * Every class here is created by hand -- no cron generates them -- and the
   * schedule was allowed to thin to two classes in the last week of September
   * while fifteen members held about thirty-eight credits expiring 29-30
   * September. Nothing said so; the studio had to spot it. This is that
   * warning. Columns used are all real ones: this endpoint previously asked
   * for three that did not exist and silently reported zeroes.
   */
  const horizonEnd = new Date(`${today}T00:00:00Z`);
  horizonEnd.setUTCDate(horizonEnd.getUTCDate() + 14);
  const horizon = horizonEnd.toISOString().slice(0, 10);

  const [upcomingRes, packRes] = await Promise.all([
    db.from('classes').select('id, class_date, capacity, category').eq('is_cancelled', false).gte('class_date', today),
    db.from('member_packs')
      .select('id, member_id, plan_name, classes_included, allowed_categories, category_limits, expires_on')
      .eq('is_frozen', false)
      .gte('expires_on', today),
  ]);

  const upcomingCls = (upcomingRes.data || []) as { id: string; class_date: string; capacity: number; category: string | null }[];
  const dates = upcomingCls.map((c) => c.class_date).sort();
  const scheduleEndsOn = dates.length ? dates[dates.length - 1] : null;
  const classesInHorizon = upcomingCls.filter((c) => c.class_date <= horizon).length;

  // Seats, not classes. One class holds six to ten people, so comparing
  // credits against a class count claims a shortage that is not there --
  // 38 credits against 2 classes reads as a crisis when 250 seats are free
  // earlier in the month.
  const { data: seatRows } = await db
    .from('bookings')
    .select('class_id')
    .eq('status', 'confirmed');
  const seatsTaken = new Map<string, number>();
  for (const b of seatRows || []) {
    if (b.class_id) seatsTaken.set(b.class_id, (seatsTaken.get(b.class_id) || 0) + 1);
  }
  const seatsFreeInHorizon = upcomingCls
    .filter((c) => c.class_date <= horizon)
    .reduce((n, c) => n + Math.max(0, (c.capacity || 0) - (seatsTaken.get(c.id) || 0)), 0);

  const livePacks = packRes.data || [];
  let creditsExpiringInHorizon = 0;
  let strandedMembers = new Set<string>();
  let strandedCredits = 0;
  /**
   * The banner used to report only a count -- "4 members hold 11 paid classes"
   * -- which left the studio scrolling the member list guessing who. The loop
   * below already knows exactly who each pack belongs to and how much is left
   * on it, so keep the rows instead of throwing them away.
   */
  type AtRisk = {
    member_id: string; name: string; phone: string; plan_name: string;
    credits_left: number; bookable_now: number; shortfall: number;
    expires_on: string; days_left: number;
    categories: string[] | null; reason: 'needs_classes' | 'can_book_now';
  };
  const atRiskRows: Omit<AtRisk, 'name' | 'phone'>[] = [];

  /**
   * Whether a pack outlives the last published class is a scheduling signal,
   * not a per-member one: four of five members flagged that way could book
   * today perfectly well. What decides what to say to someone is credits held
   * against classes still open to them in their own discipline before their
   * pack runs out. Get that wrong and the studio messages "shall I book you
   * in?" to somebody with nothing to book.
   */
  const openByCat = new Map<string, { id: string; class_date: string }[]>();
  for (const c of upcomingCls) {
    if (!c.category) continue;
    if ((seatsTaken.get(c.id) || 0) >= (c.capacity || 0)) continue;
    if (!openByCat.has(c.category)) openByCat.set(c.category, []);
    openByCat.get(c.category)!.push({ id: c.id, class_date: c.class_date });
  }
  const { data: heldRows } = await db
    .from('bookings')
    .select('member_id, class_id')
    .eq('status', 'confirmed');
  const heldBy = new Map<string, Set<string>>();
  for (const b of heldRows || []) {
    const k = b.member_id as string;
    if (!heldBy.has(k)) heldBy.set(k, new Set());
    heldBy.get(k)!.add(b.class_id as string);
  }
  if (livePacks.length) {
    const { data: spend } = await db
      .from('bookings')
      .select('pack_id, classes!inner(is_cancelled)')
      .in('pack_id', livePacks.map((p) => p.id))
      .in('status', ['confirmed', 'cancelled'])
      .eq('classes.is_cancelled', false);
    const used = new Map<string, number>();
    for (const b of spend || []) {
      if (b.pack_id) used.set(b.pack_id, (used.get(b.pack_id) || 0) + 1);
    }
    for (const p of livePacks) {
      const limits = (p as { category_limits?: Record<string, number> | null }).category_limits;
      const total = limits
        ? Object.values(limits).reduce((a, b) => a + b, 0)
        : p.classes_included;
      if (total == null) continue;            // duration-based, nothing to strand
      const left = Math.max(0, total - (used.get(p.id) || 0));
      if (left === 0) continue;
      if (p.expires_on <= horizon) creditsExpiringInHorizon += left;
      // Credits that outlive the last published class can never be spent.
      const stranded = !!scheduleEndsOn && p.expires_on > scheduleEndsOn;
      if (stranded) {
        strandedMembers.add(p.member_id as string);
        strandedCredits += left;
      }
      if (stranded || p.expires_on <= horizon) {
        const pk = p as { allowed_categories?: string[] | null; plan_name?: string | null };
        const cats = limits ? Object.keys(limits) : (pk.allowed_categories ?? null);
        const held = heldBy.get(p.member_id as string) || new Set<string>();
        const pool = (cats && cats.length
          ? cats.flatMap((c) => openByCat.get(c) || [])
          : Array.from(openByCat.values()).flat()
        ).filter((c) => c.class_date <= p.expires_on && !held.has(c.id));
        const bookable = pool.length;
        atRiskRows.push({
          member_id: p.member_id as string,
          plan_name: (pk.plan_name || '').trim() || 'Pack',
          credits_left: left,
          bookable_now: bookable,
          shortfall: Math.max(0, left - bookable),
          expires_on: p.expires_on,
          days_left: Math.round(
            (new Date(`${p.expires_on}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000,
          ),
          categories: cats,
          reason: bookable < left ? 'needs_classes' : 'can_book_now',
        });
      }
    }
  }

  // One lookup for every name and number the list needs, rather than one per row.
  let atRisk: AtRisk[] = [];
  if (atRiskRows.length) {
    const ids = Array.from(new Set(atRiskRows.map((r) => r.member_id)));
    const { data: people } = await db
      .from('members')
      .select('id, name, phone, is_active')
      .in('id', ids)
      .eq('is_active', true);
    const byId = new Map((people || []).map((m) => [m.id as string, m]));
    atRisk = atRiskRows
      .filter((r) => byId.has(r.member_id))
      .map((r) => ({
        ...r,
        name: ((byId.get(r.member_id) as { name?: string }).name || '').trim(),
        phone: (byId.get(r.member_id) as { phone?: string }).phone || '',
      }))
      // Soonest to lose their money first: that is the order to work down.
      .sort((a, b) => a.expires_on.localeCompare(b.expires_on) || b.credits_left - a.credits_left);
  }

  const todayClasses = todayClassesRes.data || [];
  const todayBookings = todayAttendanceRes.data || [];
  // Expected heads today is simply how many confirmed bookings sit against
  // today's classes.
  const totalExpected = todayBookings.length;
  const attended = todayBookings.filter((b) => b.attended === true).length;

  // membership_plans comes back as an object or a one-item array depending on
  // the relationship, the same shape the members route already handles.
  type WithPlan = { membership_plans?: { name: string } | { name: string }[] | null };
  const planNameOf = (m: WithPlan) =>
    (Array.isArray(m.membership_plans) ? m.membership_plans[0] : m.membership_plans)?.name || 'Unknown';
  const shape = (m: WithPlan & { plan_end?: string | null }) => ({
    ...m,
    plan_name: planNameOf(m),
    days_remaining: m.plan_end
      ? Math.max(0, Math.ceil((new Date(m.plan_end).getTime() - new Date(today).getTime()) / 86400000))
      : 0,
    membership_plans: undefined,
  });

  return NextResponse.json({
    today: {
      classes: todayClasses.length,
      expected_members: totalExpected,
      attended,
    },
    schedule: {
      ends_on: scheduleEndsOn,
      days_left: scheduleEndsOn
        ? Math.round((new Date(`${scheduleEndsOn}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000)
        : 0,
      classes_next_14_days: classesInHorizon,
      seats_free_next_14_days: seatsFreeInHorizon,
      credits_expiring_next_14_days: creditsExpiringInHorizon,
      stranded_members: strandedMembers.size,
      stranded_credits: strandedCredits,
      at_risk: atRisk,
    },
    expiring_this_week: (expiringRes.data || []).map(shape),
    inactive_members: (inactiveRes.data || []).map(shape),
    // Surfaced so the admin UI can say plainly that members are NOT being
    // messaged automatically — otherwise it looks like they were notified.
    whatsapp_enabled: process.env.WHATSAPP_ENABLED === 'true',
  });
}
