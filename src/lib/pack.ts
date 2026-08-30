import { getServiceClient } from './supabase';
import { todayIST } from './date';

type ServiceClient = ReturnType<typeof getServiceClient>;

export type MemberPack = {
  id: string;
  plan_id: string;
  plan_name: string;
  classes_included: number | null;
  allowed_categories: string[] | null;
  /**
   * Credits per category, for combo packs: {"pole_regular":4,"mobility":8}.
   *
   * A combo sells categories at different prices -- pole is 2,360 a class and
   * self practice 1,200 -- so one shared pool lets someone spend the whole pack
   * on the dearest category and take far more value than they paid for. Where
   * this is set it is authoritative: a category absent from it is not covered
   * at all, and each named category has its own separate allowance.
   *
   * null on every ordinary single-category pack, which behave exactly as before.
   */
  category_limits: Record<string, number> | null;
  starts_on: string;
  expires_on: string;
  is_frozen: boolean;
};

export type CategoryUsage = { category: string; limit: number; used: number; remaining: number };

export type PackWithUsage = MemberPack & {
  used: number;
  /** null when the pack has no class limit (duration-based). */
  remaining: number | null;
  /** Per-category breakdown; empty for packs with one shared pool. */
  by_category: CategoryUsage[];
};

/**
 * How many classes a single pack has consumed.
 *
 * A class is consumed the moment it is booked and STAYS consumed if the member
 * cancels it. AZDAH allows one reschedule a month; returning the credit on a
 * cancellation would make cancel-and-rebook an unlimited reschedule, which is
 * exactly what that policy exists to prevent.
 *
 * Two things deliberately do not consume a credit:
 *   - bookings left in 'rescheduled' — the replacement booking is counted instead
 *   - classes the studio itself cancelled — the member never got their session
 */
export async function countUsedInPack(db: ServiceClient, packId: string): Promise<number> {
  const { count } = await db
    .from('bookings')
    .select('id, classes!inner(is_cancelled)', { count: 'exact', head: true })
    .eq('pack_id', packId)
    .in('status', ['confirmed', 'cancelled'])
    .eq('classes.is_cancelled', false);

  return count || 0;
}

/**
 * The same count as countUsedInPack, broken down by class category.
 *
 * Same rules: a cancelled booking still counts, a studio-cancelled class does
 * not, and a 'rescheduled' row is ignored in favour of its replacement.
 */
export async function countUsedByCategory(
  db: ServiceClient,
  packId: string,
): Promise<Record<string, number>> {
  const { data } = await db
    .from('bookings')
    .select('id, classes!inner(category, is_cancelled)')
    .eq('pack_id', packId)
    .in('status', ['confirmed', 'cancelled'])
    .eq('classes.is_cancelled', false);

  const out: Record<string, number> = {};
  for (const row of data || []) {
    const cls = (row as { classes?: { category?: string | null } | { category?: string | null }[] }).classes;
    const cat = (Array.isArray(cls) ? cls[0] : cls)?.category;
    if (cat) out[cat] = (out[cat] || 0) + 1;
  }
  return out;
}

/** Credits left in one category of a combo pack. */
export function remainingInCategory(
  pack: MemberPack,
  category: string,
  usedByCat: Record<string, number>,
): number {
  const limit = pack.category_limits?.[category];
  if (limit == null) return 0;
  return Math.max(0, limit - (usedByCat[category] || 0));
}

/**
 * Give a member a pack row if they somehow have none but do hold a plan.
 *
 * Between the migration landing and this code deploying, anyone who paid was
 * written the old way: members.plan_* set, no member_packs row. Without this
 * they would be told "membership expired" the moment the new code went live,
 * having just paid. A one-off backfill cannot close that window because
 * somebody can always buy during the deploy itself, so the repair lives here
 * and runs whenever a member with no packs is looked at.
 *
 * Idempotent: it only ever inserts when the member has zero packs.
 */
export async function ensurePackForLegacyMember(db: ServiceClient, memberId: string): Promise<void> {
  const { count } = await db
    .from('member_packs')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId);
  if ((count || 0) > 0) return;

  const { data: m } = await db
    .from('members')
    .select('plan_id, plan_start, plan_end, created_at, is_frozen, freeze_days, razorpay_order_id, razorpay_payment_id, membership_plans(name, classes_included, allowed_categories, duration_days)')
    .eq('id', memberId)
    .single();
  if (!m || !m.plan_id) return;

  const planRaw = m.membership_plans;
  const plan = (Array.isArray(planRaw) ? planRaw[0] : planRaw) as
    { name: string; classes_included: number | null; allowed_categories: string[] | null; duration_days: number } | null;
  if (!plan) return;

  const startsOn = m.plan_start || String(m.created_at).slice(0, 10);
  let expiresOn = m.plan_end;
  if (!expiresOn) {
    const d = new Date(startsOn + 'T00:00:00');
    d.setDate(d.getDate() + plan.duration_days);
    expiresOn = d.toISOString().slice(0, 10);
  }

  await db.from('member_packs').insert({
    member_id: memberId,
    plan_id: m.plan_id,
    plan_name: plan.name,
    classes_included: plan.classes_included ?? null,
    allowed_categories: plan.allowed_categories ?? null,
    starts_on: startsOn,
    expires_on: expiresOn,
    is_frozen: m.is_frozen ?? false,
    freeze_days: m.freeze_days ?? 0,
    razorpay_order_id: m.razorpay_order_id ?? null,
    razorpay_payment_id: m.razorpay_payment_id ?? null,
  });

  // Their existing bookings belong to this pack — it is the only one they have.
  const { data: created } = await db
    .from('member_packs')
    .select('id')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (created) {
    await db.from('bookings')
      .update({ pack_id: created.id })
      .eq('member_id', memberId)
      .is('pack_id', null);
  }
}

/**
 * Every pack the member can spend today: started, not expired, not frozen.
 * Ordered by the one expiring soonest, which is the order they are spent in
 * so nothing lapses while a later pack is used.
 */
export async function getSpendablePacks(db: ServiceClient, memberId: string): Promise<MemberPack[]> {
  await ensurePackForLegacyMember(db, memberId);
  const today = todayIST();
  const { data } = await db
    .from('member_packs')
    .select('id, plan_id, plan_name, classes_included, allowed_categories, category_limits, starts_on, expires_on, is_frozen')
    .eq('member_id', memberId)
    .eq('is_frozen', false)
    .lte('starts_on', today)
    .gte('expires_on', today)
    .order('expires_on', { ascending: true });

  return (data || []) as MemberPack[];
}

/** Every pack the member holds, spendable or not, with usage filled in. */
export async function getAllPacksWithUsage(db: ServiceClient, memberId: string): Promise<PackWithUsage[]> {
  await ensurePackForLegacyMember(db, memberId);
  const { data } = await db
    .from('member_packs')
    .select('id, plan_id, plan_name, classes_included, allowed_categories, category_limits, starts_on, expires_on, is_frozen')
    .eq('member_id', memberId)
    .order('expires_on', { ascending: true });

  const packs = (data || []) as MemberPack[];
  return Promise.all(packs.map(async (p) => {
    const used = await countUsedInPack(db, p.id);
    let by_category: CategoryUsage[] = [];
    let remaining = p.classes_included == null ? null : Math.max(0, p.classes_included - used);

    if (p.category_limits) {
      const byCat = await countUsedByCategory(db, p.id);
      by_category = Object.entries(p.category_limits).map(([category, limit]) => ({
        category,
        limit,
        used: byCat[category] || 0,
        remaining: Math.max(0, limit - (byCat[category] || 0)),
      }));
      // The headline number is the sum of the parts, so it can never claim
      // credits that no category will actually accept.
      remaining = by_category.reduce((n, c) => n + c.remaining, 0);
    }

    return { ...p, used, remaining, by_category };
  }));
}

/**
 * A pack covers a class when it names no categories, or names this one.
 *
 * Where category_limits is set it wins outright: only the categories it names
 * are covered, whatever allowed_categories happens to say. The two combos
 * still list 'strength' from before that discipline was dropped, and the
 * limits are the deliberate, current answer.
 */
export function packCoversCategory(pack: MemberPack, category: string | null): boolean {
  if (pack.category_limits) {
    if (!category) return false;
    return Object.prototype.hasOwnProperty.call(pack.category_limits, category);
  }
  if (!pack.allowed_categories || pack.allowed_categories.length === 0) return true;
  if (!category) return true;
  return pack.allowed_categories.includes(category);
}

/**
 * Which pack should pay for this class.
 *
 * Spends the pack expiring soonest among those that cover the category and
 * still hold a credit, so a member with both a Mobility and a Pole pack spends
 * the right one and neither lapses while the other is being used.
 *
 * Returns why nothing could pay, so the caller can tell the member whether they
 * are out of credits or the class simply is not in any pack they hold.
 */
export async function pickPackForClass(
  db: ServiceClient,
  memberId: string,
  category: string | null,
): Promise<{ pack: MemberPack | null; reason: 'ok' | 'no_pack' | 'not_covered' | 'exhausted' }> {
  const packs = await getSpendablePacks(db, memberId);
  if (packs.length === 0) return { pack: null, reason: 'no_pack' };

  const covering = packs.filter((p) => packCoversCategory(p, category));
  if (covering.length === 0) return { pack: null, reason: 'not_covered' };

  for (const p of covering) {
    // A combo is spent per category: having pole credits left says nothing
    // about whether this mobility class is paid for.
    if (p.category_limits) {
      const byCat = await countUsedByCategory(db, p.id);
      if (category && remainingInCategory(p, category, byCat) > 0) {
        return { pack: p, reason: 'ok' };
      }
      continue;
    }
    // No class limit means duration-based: spendable for as long as it runs.
    if (p.classes_included == null) return { pack: p, reason: 'ok' };
    const used = await countUsedInPack(db, p.id);
    if (used < p.classes_included) return { pack: p, reason: 'ok' };
  }
  return { pack: null, reason: 'exhausted' };
}

/** The union of categories the member may book across every spendable pack. */
export async function allowedCategoriesUnion(db: ServiceClient, memberId: string): Promise<string[] | null> {
  const packs = await getSpendablePacks(db, memberId);
  if (packs.length === 0) return [];
  // A pack with no category restriction opens everything.
  if (packs.some((p) => !p.category_limits && (!p.allowed_categories || p.allowed_categories.length === 0))) return null;
  return Array.from(new Set(packs.flatMap((p) =>
    p.category_limits ? Object.keys(p.category_limits) : (p.allowed_categories as string[]))));
}

/**
 * Classes left across every spendable pack — the single number the dashboard
 * shows. A duration-based pack makes the total unlimited (null).
 */
export async function totalRemaining(db: ServiceClient, memberId: string): Promise<number | null> {
  const packs = await getSpendablePacks(db, memberId);
  let total = 0;
  for (const p of packs) {
    if (p.category_limits) {
      const byCat = await countUsedByCategory(db, p.id);
      for (const cat of Object.keys(p.category_limits)) {
        total += remainingInCategory(p, cat, byCat);
      }
      continue;
    }
    if (p.classes_included == null) return null;
    total += Math.max(0, p.classes_included - (await countUsedInPack(db, p.id)));
  }
  return total;
}
