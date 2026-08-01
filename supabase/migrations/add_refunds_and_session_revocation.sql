-- AZDAH — refund tracking + session revocation
-- Run this in the Supabase SQL editor BEFORE deploying the matching code.
-- Safe to re-run (idempotent).

-- ─── 1. Refund tracking ───────────────────────────────────────────────
-- Revenue previously counted every paying member at full value forever, even
-- after they were refunded. Record how much was given back so reports can
-- subtract it. Stored in paise, like every other money column.
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS refunded_paise INT NOT NULL DEFAULT 0;

-- ─── 2. Session revocation ────────────────────────────────────────────
-- Session tokens are self-contained and valid for 7 days, so deactivating a
-- member (or resetting their password) did not log them out. Any token issued
-- before this timestamp is rejected.
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS sessions_valid_from TIMESTAMPTZ;

COMMENT ON COLUMN members.refunded_paise IS 'Total refunded to this member, in paise. Subtracted from revenue reporting.';
COMMENT ON COLUMN members.sessions_valid_from IS 'Session tokens issued before this instant are rejected. Bumped on deactivate / password reset.';
