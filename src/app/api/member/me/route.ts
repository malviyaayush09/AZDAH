export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { countUsedClasses } from '@/lib/pack';
import { verifySession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const sessionToken = req.cookies.get('session')?.value;
  const session = sessionToken ? await verifySession(sessionToken) : null;
  if (!session || (session as { role: string }).role !== 'member') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { memberId } = session as { memberId: string };

  const db = getServiceClient();
  const { data: member } = await db
    .from('members')
    .select('id, name, phone, plan_id, plan_start, plan_end, reschedule_used_this_month, reschedule_reset_date, must_change_password, is_frozen, is_active, sessions_valid_from, membership_plans(name, classes_included)')
    .eq('id', memberId)
    .single();

  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

  // Session tokens are self-contained and last 7 days, so deactivating a member
  // or resetting their password did not log them out. Reject revoked sessions
  // here — the dashboard polls this endpoint, so it bounces them to login.
  if (!member.is_active) {
    return NextResponse.json({ error: 'Account is inactive' }, { status: 401 });
  }
  const issuedAt = (session as { iat?: number }).iat;
  if (member.sessions_valid_from && issuedAt
      && issuedAt * 1000 < new Date(member.sessions_valid_from).getTime()) {
    return NextResponse.json({ error: 'Session expired. Please log in again.' }, { status: 401 });
  }

  const planEnd = member.plan_end ? new Date(member.plan_end) : new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = planEnd.getTime() - today.getTime();
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  // Auto-reset reschedule flag if new month
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  let rescheduleUsed = member.reschedule_used_this_month;
  if (!member.reschedule_reset_date || member.reschedule_reset_date < firstOfMonth) {
    await db.from('members').update({ reschedule_used_this_month: false, reschedule_reset_date: firstOfMonth }).eq('id', memberId);
    rescheduleUsed = false;
  }

  const plans = member.membership_plans;
  const planInfo = (Array.isArray(plans) ? plans[0] : plans as { name: string; classes_included: number | null } | null);
  const planName = planInfo?.name || 'Unknown Plan';
  const classesIncluded = planInfo?.classes_included ?? null;

  // Count used classes in current pack (confirmed + attended since plan_start)
  let classesRemaining: number | null = null;
  if (classesIncluded !== null && member.plan_start) {
    const usedCount = await countUsedClasses(db, memberId, member.plan_start);
    classesRemaining = Math.max(0, classesIncluded - usedCount);
  }

  return NextResponse.json({
    member: {
      id: member.id,
      name: member.name,
      phone: member.phone,
      plan_name: planName,
      plan_start: member.plan_start,
      plan_end: member.plan_end,
      days_remaining: daysRemaining,
      classes_included: classesIncluded,
      classes_remaining: classesRemaining,
      reschedule_used: rescheduleUsed,
      must_change_password: member.must_change_password ?? false,
      is_frozen: member.is_frozen ?? false,
    },
  });
}
