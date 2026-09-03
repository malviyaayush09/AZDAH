export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { pickPackForClass } from '@/lib/pack';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  if (!session || (session as { role: string }).role !== 'admin') return null;
  return session;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { classId: string } }
) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getServiceClient();

  const { data, error } = await db
    .from('bookings')
    .select('id, created_at, attended, member:members(id, name, phone, plan_end)')
    .eq('class_id', params.classId)
    .eq('status', 'confirmed')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  /**
   * Who is waiting, and -- the part that matters -- whether adding a seat would
   * actually give it to them.
   *
   * The studio could not see a waitlist at all. So "add a spot" was a guess:
   * press it and either someone appears in the class or nothing visible
   * happens, with no way to know which to expect or why. A member who has spent
   * every credit on their pack can still sit on a waitlist forever, and that is
   * correct -- they cannot take a fifth class on a four-class pack -- but it has
   * to be visible, or it reads as the button being broken.
   */
  const { data: cls } = await db
    .from('classes')
    .select('category, class_date')
    .eq('id', params.classId)
    .single();

  const { data: queue } = await db
    .from('waitlist')
    .select('id, created_at, member:members(id, name, phone, is_active, is_frozen)')
    .eq('class_id', params.classId)
    .order('created_at', { ascending: true });

  const REASONS: Record<string, string> = {
    no_pack: 'No active pack',
    not_covered: 'Their pack does not include this type of class',
    exhausted: 'No classes left on their pack',
    expires_before_class: 'Their pack runs out before this class',
  };

  const waitlist = [];
  const rows = queue || [];
  for (let i = 0; i < rows.length; i++) {
    const entry = rows[i];
    const raw = entry.member;
    const m = (Array.isArray(raw) ? raw[0] : raw) as
      { id: string; name: string; phone: string; is_active: boolean; is_frozen: boolean | null } | null;

    let canBePromoted = false;
    let reason: string | null = 'Member not found';
    if (m) {
      if (!m.is_active) reason = 'Account is inactive';
      else if (m.is_frozen) reason = 'Membership is frozen';
      else {
        const { pack, reason: why } = await pickPackForClass(db, m.id, cls?.category ?? null, cls?.class_date);
        canBePromoted = !!pack;
        reason = pack ? null : (REASONS[why] ?? 'Cannot be booked into this class');
      }
    }
    waitlist.push({ id: entry.id, position: i + 1, created_at: entry.created_at, member: m, canBePromoted, reason });
  }

  return NextResponse.json({ bookings: data || [], waitlist });
}
