-- ─── Promo / discount codes ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  discount_percent INTEGER NOT NULL CHECK (discount_percent BETWEEN 1 AND 100),
  max_uses INTEGER DEFAULT NULL,
  uses_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ DEFAULT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "promo_codes_service_only" ON promo_codes USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Admin audit log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_phone TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON admin_audit_log(created_at DESC);
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "audit_service_only" ON admin_audit_log USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Admin OTP for 2FA ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_otp (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL,
  otp TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE admin_otp ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "admin_otp_service_only" ON admin_otp USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Class reminder tracking on bookings ─────────────────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE;
