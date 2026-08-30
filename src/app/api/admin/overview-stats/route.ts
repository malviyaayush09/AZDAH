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
    expiring_this_week: (expiringRes.data || []).map(shape),
    inactive_members: (inactiveRes.data || []).map(shape),
    // Surfaced so the admin UI can say plainly that members are NOT being
    // messaged automatically — otherwise it looks like they were notified.
    whatsapp_enabled: process.env.WHATSAPP_ENABLED === 'true',
  });
}
