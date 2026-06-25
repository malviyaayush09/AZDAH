-- AZDAH Feature Migration — run this in Supabase SQL Editor

-- 1. Attendance tracking on bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS attended boolean;

-- 2. Waitlist table
CREATE TABLE IF NOT EXISTS waitlist (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id   uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  class_id    uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (member_id, class_id)
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "waitlist_service_only" ON waitlist
  FOR ALL USING (false);
