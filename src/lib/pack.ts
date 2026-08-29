import { getServiceClient } from './supabase';

type ServiceClient = ReturnType<typeof getServiceClient>;

/**
 * How many classes the member has consumed from their current pack.
 *
 * A class is consumed the moment it is booked and STAYS consumed if the member
 * cancels it. AZDAH allows one reschedule a month; returning the credit on a
 * cancellation would make cancel-and-rebook an unlimited reschedule, which is
 * what the policy exists to prevent.
 *
 * Two things deliberately do not consume a credit:
 *   - bookings left in 'rescheduled' — the replacement booking is counted instead
 *   - classes the studio itself cancelled — the member never got their session
 */
export async function countUsedClasses(
  db: ServiceClient,
  memberId: string,
  planStart: string | null,
): Promise<number> {
  const { count } = await db
    .from('bookings')
    .select('id, classes!inner(is_cancelled)', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .in('status', ['confirmed', 'cancelled'])
    .eq('classes.is_cancelled', false)
    .gte('created_at', (planStart || '1970-01-01') + 'T00:00:00Z');

  return count || 0;
}
