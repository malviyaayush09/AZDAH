import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser client (uses anon key + RLS)
export const supabase = createClient(url, anonKey);

/*
 * Every read this client makes must reach the database.
 *
 * Next.js replaces the global fetch inside route handlers and caches GET
 * responses by default. PostgREST reads -- everything built with .select() --
 * are GETs, so they were being served from that cache and the answers froze,
 * separately in each edge region. .rpc() calls are POSTs and were never
 * cached, which is why the admin panel stayed correct while the public
 * timetable did not: on 11 September it showed the 10 AM class on the 12th as
 * full when two seats were free, showed two genuinely full classes as
 * available, and omitted a class entirely -- and the same request answered 37
 * classes one moment and 38 the next.
 *
 * Bookings, capacity and the timetable are live data. Nothing this client
 * reads is safe to cache, so the cache is turned off here, once, rather than
 * per route.
 */
export function getServiceClient() {
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: 'no-store' }),
    },
  });
}

// ─── Types ───────────────────────────────────────────────────

export type MembershipPlan = {
  id: string;
  name: string;
  description: string | null;
  duration_days: number;
  price_paise: number;
  sessions_per_week: number;
  features: string[];
  sort_order: number;
  classes_included: number | null;
  plan_category: string;
};

export type Member = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  plan_id: string | null;
  plan_start: string | null;
  plan_end: string | null;
  is_active: boolean;
  reschedule_used_this_month: boolean;
  reschedule_reset_date: string | null;
  razorpay_payment_id: string | null;
  created_at: string;
};

export type Class = {
  id: string;
  title: string;
  trainer_name: string | null;
  class_date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  is_cancelled: boolean;
};

export type Booking = {
  id: string;
  member_id: string;
  class_id: string;
  status: 'confirmed' | 'cancelled' | 'rescheduled';
  rescheduled_from: string | null;
  created_at: string;
};
