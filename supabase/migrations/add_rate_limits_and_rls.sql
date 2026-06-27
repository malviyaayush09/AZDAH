-- ─── Rate limits table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_key_created ON rate_limits(key, created_at);
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
-- Only service role can read/write (API uses service client)
CREATE POLICY "service_only" ON rate_limits USING (false);

-- ─── RLS policies for existing tables ─────────────────────────────────────────

-- members: no public access
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_service_only" ON members USING (false);

-- classes: public can read upcoming classes (for landing page if needed)
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "classes_service_only" ON classes USING (false);

-- bookings: no public access
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bookings_service_only" ON bookings USING (false);

-- membership_plans: public can read active plans (needed for pricing page)
ALTER TABLE membership_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_public_read" ON membership_plans
  FOR SELECT USING (is_active = true);

-- payment_intents: no public access
ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_intents_service_only" ON payment_intents USING (false);

-- login_attempts: no public access
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "login_attempts_service_only" ON login_attempts USING (false);

-- waitlist: no public access
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "waitlist_service_only" ON waitlist USING (false);
