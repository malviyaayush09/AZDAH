import { pickPackForClass } from '@/lib/pack';
import { sendWaitlistPromoted } from '@/lib/whatsapp';

type ServiceClient = ReturnType<typeof import('@/lib/supabase').getServiceClient>;

type WaitMember = {
  name: string;
  phone: string;
  is_active: boolean;
  is_frozen: boolean | null;
};

export type Promoted = { memberId: string; name: string; phone: string };

/**
 * Give up to `seats` free places in a class to the front of its waitlist.
 *
 * Extracted from the cancellation route so that raising a class's capacity uses
 * exactly the same rules. Two things here are easy to get wrong and were both
 * wrong at some point:
 *
 *  - **Eligibility.** Promotion once booked whoever was first with no checks,
 *    so an inactive, frozen or credit-exhausted member could be handed a class
 *    they could not have booked themselves. The queue is walked in order and
 *    anyone who could not book it is skipped, not stopped at.
 *
 *  - **Who pays.** The paying pack must be written onto the booking. Usage is
 *    counted as bookings carrying a pack_id, so a promotion inserted without
 *    one is a free class. Judged against the CLASS date, not today, so a pack
 *    expiring before the class cannot pay for it.
 *
 * Returns who was promoted, so the caller can report it.
 */
export async function promoteFromWaitlist(
  db: ServiceClient,
  classId: string,
  seats: number,
): Promise<Promoted[]> {
  if (seats <= 0) return [];

  const { data: cls } = await db
    .from('classes')
    .select('id, title, class_date, start_time, category, is_cancelled')
    .eq('id', classId)
    .single();
  if (!cls || cls.is_cancelled) return [];

  const { data: queue } = await db
    .from('waitlist')
    .select('id, member_id, members(name, phone, is_active, is_frozen)')
    .eq('class_id', classId)
    .order('created_at', { ascending: true });

  const promoted: Promoted[] = [];

  for (const entry of queue || []) {
    if (promoted.length >= seats) break;

    const raw = entry.members;
    const m = (Array.isArray(raw) ? raw[0] : raw) as WaitMember | null;
    if (!m || !m.is_active || m.is_frozen) continue;

    const { pack: payer } = await pickPackForClass(db, entry.member_id, cls.category ?? null, cls.class_date);
    if (!payer) continue;

    const { error } = await db.from('bookings').upsert(
      {
        member_id: entry.member_id,
        class_id: classId,
        status: 'confirmed',
        pack_id: payer.id,
      },
      { onConflict: 'member_id,class_id' },
    );
    if (error) continue;

    await db.from('waitlist').delete().eq('id', entry.id);
    promoted.push({ memberId: entry.member_id, name: m.name, phone: m.phone });

    // Fire and forget: a messaging failure must not undo a place that has
    // already been given, and the switch may be off entirely.
    sendWaitlistPromoted(m.phone, m.name, cls.title, cls.class_date, cls.start_time)
      .catch((e) => console.error('Waitlist promotion WA failed:', e));
  }

  return promoted;
}
