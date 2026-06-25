-- AZDAH Fitness Web App — Supabase Schema
-- Run this in Supabase SQL Editor

-- ─── Extensions ─────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Membership Plans ────────────────────────────────────────
create table membership_plans (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,                    -- e.g. "Monthly", "Quarterly"
  duration_days int not null,                   -- 30, 90, 180, 365
  price_paise int not null,                     -- in paise (₹1500 = 150000)
  sessions_per_week int not null default 6,     -- allowed sessions/week
  features    text[] not null default '{}',
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz default now()
);

-- ─── Members ─────────────────────────────────────────────────
create table members (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  phone           text not null unique,          -- 91XXXXXXXXXX format
  email           text,
  password_hash   text not null,                 -- bcrypt hash
  plan_id         uuid references membership_plans(id),
  plan_start      date,
  plan_end        date,
  is_active       boolean not null default true,
  reschedule_used_this_month boolean not null default false,
  reschedule_reset_date date,                    -- first day of current month
  razorpay_payment_id text,
  razorpay_order_id   text,
  created_at      timestamptz default now()
);

-- ─── Classes / Slots ─────────────────────────────────────────
create table classes (
  id           uuid primary key default uuid_generate_v4(),
  title        text not null,                    -- e.g. "Morning Yoga", "HIIT"
  trainer_name text,
  class_date   date not null,
  start_time   time not null,
  end_time     time not null,
  capacity     int not null default 20,
  is_cancelled boolean not null default false,
  created_at   timestamptz default now()
);

-- ─── Bookings ────────────────────────────────────────────────
create table bookings (
  id           uuid primary key default uuid_generate_v4(),
  member_id    uuid not null references members(id) on delete cascade,
  class_id     uuid not null references classes(id) on delete cascade,
  status       text not null default 'confirmed'  -- confirmed | cancelled | rescheduled
                check (status in ('confirmed','cancelled','rescheduled')),
  rescheduled_from uuid references bookings(id),  -- original booking if this is a reschedule
  created_at   timestamptz default now(),
  unique (member_id, class_id)
);

-- ─── Row Level Security ──────────────────────────────────────
alter table membership_plans enable row level security;
alter table members enable row level security;
alter table classes enable row level security;
alter table bookings enable row level security;

-- Plans: anyone can read active plans
create policy "plans_public_read" on membership_plans
  for select using (is_active = true);

-- Members: service role only (all member ops go through API routes with service key)
create policy "members_service_only" on members
  for all using (false);

-- Classes: any authenticated member can read future classes
create policy "classes_members_read" on classes
  for select using (true);

-- Bookings: service role only
create policy "bookings_service_only" on bookings
  for all using (false);

-- ─── Payment Intents (temp storage during checkout) ─────────────
create table payment_intents (
  order_id  text primary key,
  phone     text not null,
  name      text not null,
  email     text,
  plan_id   uuid references membership_plans(id),
  status    text not null default 'pending',
  created_at timestamptz default now()
);

alter table payment_intents enable row level security;
create policy "intents_service_only" on payment_intents for all using (false);

-- ─── Seed membership plans ────────────────────────────────────
insert into membership_plans (name, duration_days, price_paise, sessions_per_week, features, sort_order)
values
  ('Monthly',     30,  150000, 6, ARRAY['6 sessions/week','Locker access','Progress tracking'], 1),
  ('Quarterly',   90,  400000, 6, ARRAY['6 sessions/week','Locker access','Progress tracking','₹500 savings'], 2),
  ('Half-Yearly', 180, 700000, 6, ARRAY['6 sessions/week','Locker access','Progress tracking','₹2000 savings','Free diet plan'], 3),
  ('Annual',      365, 1200000,6, ARRAY['6 sessions/week','Locker access','Progress tracking','₹6000 savings','Free diet plan','Priority booking'], 4);

-- ─── Helper functions ─────────────────────────────────────────

-- Check if member can reschedule (once per calendar month)
create or replace function can_reschedule(member_uuid uuid)
returns boolean language plpgsql as $$
declare
  m members%rowtype;
  first_of_month date := date_trunc('month', current_date)::date;
begin
  select * into m from members where id = member_uuid;
  if not found then return false; end if;

  -- Reset flag if we're in a new month
  if m.reschedule_reset_date is null or m.reschedule_reset_date < first_of_month then
    update members set reschedule_used_this_month = false, reschedule_reset_date = first_of_month
    where id = member_uuid;
    return true;
  end if;

  return not m.reschedule_used_this_month;
end;
$$;

-- Count confirmed bookings for a class (for capacity check)
create or replace function class_booking_count(class_uuid uuid)
returns int language sql as $$
  select count(*)::int from bookings where class_id = class_uuid and status = 'confirmed';
$$;
