import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser client (uses anon key + RLS)
export const supabase = createClient(url, anonKey);

// Server/API client (uses service role key — bypasses RLS)
export function getServiceClient() {
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
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
