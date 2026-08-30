export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { todayIST } from '@/lib/date';

type PackRow = {
  id: string; member_id: string; plan_name: string;
  classes_included: number | null; starts_on: string; expires_on: string; is_frozen: boolean;
};

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  if (!session || (session as { role: string }).role !== 'admin') return null;
  return session;
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getServiceClient();
  const { data: members } = await db
    .from('members')
    .select('id, name, phone, plan_id, plan_start, plan_end, is_active, reschedule_used_this_month, razorpay_payment_id, created_at, membership_plans(name)')
    .order('created_at', { ascending: false });

  // Every pack every member holds, with how much of each is spent. Fetched in
  // two queries rather than per member so the list stays one round trip.
  const memberIds = (members || []).map((m) => m.id);
  const { data: packRows } = memberIds.length
    ? await db
        .from('member_packs')
        .select('id, member_id, plan_name, classes_included, category_limits, starts_on, expires_on, is_frozen')
        .in('member_id', memberIds)
        .order('expires_on', { ascending: true })
    : { data: [] as PackRow[] };

  const packIds = (packRows || []).map((p) => p.id);
  const { data: spendRows } = packIds.length
    ? await db
        .from('bookings')
        .select('pack_id, classes!inner(is_cancelled, category)')
        .in('pack_id', packIds)
        .in('status', ['confirmed', 'cancelled'])
        .eq('classes.is_cancelled', false)
    : { data: [] as { pack_id: string }[] };

  const usedByPack = new Map<string, number>();
  // Also per category, so a combo can report 4 pole and 8 mobility separately
  // rather than one pooled number that hides which half has run out.
  const usedByPackCat = new Map<string, Record<string, number>>();
  for (const b of spendRows || []) {
    if (!b.pack_id) continue;
    usedByPack.set(b.pack_id, (usedByPack.get(b.pack_id) || 0) + 1);
    const cls = (b as { classes?: { category?: string | null } | { category?: string | null }[] }).classes;
    const cat = (Array.isArray(cls) ? cls[0] : cls)?.category;
    if (cat) {
      const m = usedByPackCat.get(b.pack_id) || {};
      m[cat] = (m[cat] || 0) + 1;
      usedByPackCat.set(b.pack_id, m);
    }
  }

  // todayIST, not toISOString on a local Date: the servers run in UTC, so
  // between 18:30 and midnight UTC it is already tomorrow in India and packs
  // that expired were still being reported live.
  const todayStr = todayIST();
  // Same basis as plan_end, which parses as UTC midnight, so the difference is
  // a whole number of days rather than a fraction that rounds unpredictably.
  const today = new Date(todayStr);

  // How many bookings each member has ever made. The admin screen uses this to
  // decide whether a member can be deleted outright: someone with bookings has
  // history worth keeping, and only gets deactivated.
  const { data: bookingRows } = memberIds.length
    ? await db.from('bookings').select('member_id').in('member_id', memberIds)
    : { data: [] as { member_id: string }[] };
  const bookingCount = new Map<string, number>();
  for (const b of bookingRows || []) {
    bookingCount.set(b.member_id, (bookingCount.get(b.member_id) || 0) + 1);
  }

  const packsByMember = new Map<string, ReturnType<typeof shapePack>[]>();
  function shapePack(p: PackRow) {
    const used = usedByPack.get(p.id) || 0;
    const limits = (p as PackRow & { category_limits?: Record<string, number> | null }).category_limits;
    const byCat = usedByPackCat.get(p.id) || {};
    const by_category = limits
      ? Object.entries(limits).map(([category, limit]) => ({
          category, limit,
          used: byCat[category] || 0,
          remaining: Math.max(0, limit - (byCat[category] || 0)),
        }))
      : [];
    return {
      id: p.id,
      name: p.plan_name,
      classes_included: p.classes_included,
      used,
      by_category,
      remaining: limits
        ? by_category.reduce((n, c) => n + c.remaining, 0)
        : p.classes_included == null ? null : Math.max(0, p.classes_included - used),
      starts_on: p.starts_on,
      expires_on: p.expires_on,
      is_frozen: p.is_frozen,
      is_live: p.expires_on >= todayStr,
    };
  }
  for (const p of (packRows || []) as PackRow[]) {
    const list = packsByMember.get(p.member_id) || [];
    list.push(shapePack(p));
    packsByMember.set(p.member_id, list);
  }

  const enriched = (members || []).map((m) => {
    const planEnd = m.plan_end ? new Date(m.plan_end) : new Date(0);
    const diffMs = planEnd.getTime() - today.getTime();
    const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    const packs = packsByMember.get(m.id) || [];
    const live = packs.filter((p) => p.is_live);
    return {
      ...m,
      // plan_name now names the PRIMARY pack. Where a member holds more than
      // one, the list below is the truth.
      plan_name: (Array.isArray(m.membership_plans) ? m.membership_plans[0] : m.membership_plans as { name: string } | null)?.name || 'Unknown',
      days_remaining: daysRemaining,
      reschedule_used: m.reschedule_used_this_month,
      packs,
      live_pack_count: live.length,
      booking_count: bookingCount.get(m.id) || 0,
      classes_remaining: live.some((p) => p.remaining === null)
        ? null
        : live.reduce((sum, p) => sum + (p.remaining || 0), 0),
      membership_plans: undefined,
    };
  });

  const stats = {
    total_members: enriched.length,
    active_members: enriched.filter((m) => m.is_active && m.days_remaining > 0).length,
    expiring_soon: enriched.filter((m) => m.is_active && m.days_remaining <= 7 && m.days_remaining > 0).length,
  };

  return NextResponse.json({ members: enriched, stats });
}
