export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  if (!session || (session as { role: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getServiceClient();
  const today = new Date().toISOString().split('T')[0];
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const ago30Days = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const [todayClassesRes, expiringRes, inactiveRes, todayAttendanceRes] = await Promise.all([
    // Today's classes with booking counts
    db.from('classes')
      .select('id, title, start_time, end_time, capacity, booked_count')
      .eq('class_date', today)
      .eq('is_cancelled', false)
      .order('start_time'),

    // Members expiring in next 7 days
    db.from('members')
      .select('id, name, phone, plan_name, plan_end, days_remaining')
      .eq('is_active', true)
      .gte('plan_end', today)
      .lte('plan_end', in7Days)
      .order('plan_end'),

    // Inactive members (is_active = false)
    db.from('members')
      .select('id, name, phone, plan_name, plan_end, created_at')
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
  const totalExpected = todayClasses.reduce((s, c) => s + (c.booked_count || 0), 0);
  const attended = (todayAttendanceRes.data || []).filter((b) => b.attended === true).length;

  return NextResponse.json({
    today: {
      classes: todayClasses.length,
      expected_members: totalExpected,
      attended,
    },
    expiring_this_week: expiringRes.data || [],
    inactive_members: inactiveRes.data || [],
  });
}
