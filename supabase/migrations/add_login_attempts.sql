-- Rate limiting table for login endpoint
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL,
  success BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_phone_created
  ON login_attempts(phone, created_at);

-- Auto-delete old attempts after 24 hours via RLS or a scheduled job
-- For now, the API cleans up entries older than 1 hour on each request
