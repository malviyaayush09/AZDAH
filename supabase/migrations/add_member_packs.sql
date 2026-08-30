-- ═══════════════════════════════════════════════════════════════════════════
--  MULTI-PACK  ·  step 1 of 2  ·  SCHEMA ONLY, NO BEHAVIOUR CHANGE
-- ═══════════════════════════════════════════════════════════════════════════
--  A member can currently hold exactly one pack: members.plan_id / plan_start /
--  plan_end. That is why api/create-order returns 409 'already_member' — a second
--  purchase would overwrite the first and destroy credits the member had paid for.
--
--  This migration adds somewhere to put a second pack. It changes NO behaviour:
--  nothing reads member_packs or bookings.pack_id until the application code
--  ships. Running this on its own is safe and reversible.
--
--  SAFETY PROPERTIES, deliberately:
--    · additive only — no DROP, no ALTER of an existing column, no deletes
--    · no NOT NULL added to any existing table
--    · idempotent — safe to run twice (IF NOT EXISTS + NOT EXISTS guards)
--    · members.plan_id / plan_start / plan_end keep working exactly as today
--    · rollback at the bottom, and it is clean because both objects are new
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. one row per pack a member has bought ──────────────────────────────
create table if not exists member_packs (
  id                  uuid primary key default uuid_generate_v4(),
  member_id           uuid not null references members(id) on delete cascade,
  plan_id             uuid not null references membership_plans(id),

  -- Snapshots taken at purchase. A plan can be renamed, repriced or have its
  -- contents edited later; what somebody already bought must never change
  -- underneath them.
  plan_name           text not null,
  classes_included    int,          -- null = unlimited for the duration
  allowed_categories  text[],       -- null/empty = every category

  starts_on           date not null,
  expires_on          date not null,
  is_frozen           boolean not null default false,
  freeze_days         int not null default 0,

  razorpay_order_id   text,
  razorpay_payment_id text,
  amount_paid_paise   int,

  created_at          timestamptz not null default now()
);

comment on table member_packs is
  'One row per purchased class pack. A member may hold several at once. Columns plan_name, classes_included and allowed_categories are snapshots taken at purchase so later edits to membership_plans cannot change a pack somebody already paid for.';

create index if not exists member_packs_member_idx  on member_packs(member_id);
create index if not exists member_packs_lookup_idx  on member_packs(member_id, expires_on);

-- ─── 2. charge every booking to a specific pack ───────────────────────────
-- Nullable on purpose: existing rows have no pack until the backfill below,
-- and a null must never break the current code path.
alter table bookings add column if not exists pack_id uuid references member_packs(id);
create index if not exists bookings_pack_idx on bookings(pack_id);

comment on column bookings.pack_id is
  'Which pack this booking spends a credit from. Null only for rows predating multi-pack.';

-- ─── 3. backfill: give every current member exactly one pack ──────────────
-- Mirrors what they hold today, so the new table starts out agreeing with the
-- old columns. The NOT EXISTS guard makes re-running a no-op.
insert into member_packs (
  member_id, plan_id, plan_name, classes_included, allowed_categories,
  starts_on, expires_on, is_frozen, freeze_days,
  razorpay_order_id, razorpay_payment_id, created_at
)
select
  m.id,
  m.plan_id,
  p.name,
  p.classes_included,
  p.allowed_categories,
  -- plan_start is nullable in live data; fall back to the join date
  coalesce(m.plan_start, m.created_at::date),
  -- plan_end is nullable too; derive it the same way the app does
  coalesce(m.plan_end, coalesce(m.plan_start, m.created_at::date) + p.duration_days),
  coalesce(m.is_frozen, false),
  coalesce(m.freeze_days, 0),
  m.razorpay_order_id,
  m.razorpay_payment_id,
  coalesce(m.created_at, now())
from members m
join membership_plans p on p.id = m.plan_id
where m.plan_id is not null
  and not exists (select 1 from member_packs mp where mp.member_id = m.id);

-- ─── 4. point every existing booking at that pack ─────────────────────────
-- Safe because each member has exactly one pack at this instant, so there is
-- no ambiguity about which one a historic booking belongs to.
update bookings b
set pack_id = mp.id
from member_packs mp
where mp.member_id = b.member_id
  and b.pack_id is null;

-- ─── verification — run these and eyeball before trusting the migration ───
-- select count(*) as members_with_plan from members where plan_id is not null;
-- select count(*) as packs_created      from member_packs;            -- must match
-- select count(*) as bookings_total     from bookings;
-- select count(*) as bookings_unlinked  from bookings where pack_id is null;
--   -- expected: only bookings whose member has no plan_id
-- select m.name, count(mp.id) from members m left join member_packs mp on mp.member_id = m.id
--   group by m.name having count(mp.id) > 1;   -- must return zero rows

-- ═══════════════════════════════════════════════════════════════════════════
--  ROLLBACK — clean, because both objects are new. Order matters: the
--  foreign key must go before the table it points at.
--    alter table bookings drop column if exists pack_id;
--    drop table if exists member_packs;
-- ═══════════════════════════════════════════════════════════════════════════
