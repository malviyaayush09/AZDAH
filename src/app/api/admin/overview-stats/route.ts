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
    db.from('classes').select('id, class_date, capacity').eq('is_cancelled', false).gte('class_date', today),
    db.from('member_packs')
      .select('id, member_id, classes_included, category_limits, expires_on')
      .eq('is_frozen', false)
      .gte('expires_on', today),
  ]);

  const upcomingCls = (upcomingRes.data || []) as { id: string; class_date: string; capacity: number }[];
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
      if (scheduleEndsOn && p.expires_on > scheduleEndsOn) {
        strandedMembers.add(p.member_id as string);
        strandedCredits += left;
      }
    }
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
    },
    expiring_this_week: (expiringRes.data || []).map(shape),
    inactive_members: (inactiveRes.data || []).map(shape),
    // Surfaced so the admin UI can say plainly that members are NOT being
    // messaged automatically — otherwise it looks like they were notified.
    whatsapp_enabled: process.env.WHATSAPP_ENABLED === 'true',
  });
}
