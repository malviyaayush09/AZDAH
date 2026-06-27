-- ─── Force password change on first login ─────────────────────────────────────
ALTER TABLE members ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;

-- ─── Membership freeze ────────────────────────────────────────────────────────
ALTER TABLE members ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN DEFAULT FALSE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS freeze_days INTEGER DEFAULT 0;

-- ─── Expiry reminder tracking ─────────────────────────────────────────────────
ALTER TABLE members ADD COLUMN IF NOT EXISTS expiry_reminder_sent BOOLEAN DEFAULT FALSE;

-- Reset expiry_reminder_sent when plan_end changes (on renewal)
-- (handled in application code — upsert sets expiry_reminder_sent = false)
