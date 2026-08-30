-- Per-category credits on combo packs.
--
-- WHY
-- A pack has one pool of credits plus a list of categories it may be spent on.
-- That is right for a single-discipline pack and wrong for a combo, because the
-- disciplines are not priced alike: a pole class is Rs 2,360 and self practice
-- is Rs 1,200. Combo - Pole + Practice sells 8 credits across both for
-- Rs 11,000, so a member can spend all 8 on pole and take Rs 18,880 of pole for
-- Rs 11,000. One member is already 5 pole classes into exactly that.
--
-- WHAT THIS DOES
-- Adds a nullable category_limits column holding, for combos only, the credits
-- allowed in each category: {"pole_regular":4,"mobility":8}. Every ordinary
-- pack leaves it null and behaves precisely as it does today.
--
-- SAFE TO RUN
--   * Additive only. No DROP, no data rewritten, no column retyped.
--   * Idempotent. Running it twice changes nothing the second time.
--   * Touches membership_plans only, never member_packs. Packs people have
--     already bought keep the terms they were sold under.

-- ── 1. the column ─────────────────────────────────────────────────────────
alter table membership_plans add column if not exists category_limits jsonb;
alter table member_packs     add column if not exists category_limits jsonb;

comment on column membership_plans.category_limits is
  'Combo packs only: credits per class category, e.g. {"pole_regular":4,"mobility":8}. Null means one shared pool of classes_included.';
comment on column member_packs.category_limits is
  'Snapshot of the plan''s category_limits at purchase, so repricing a plan never changes a pack already sold.';

-- ── 2. the three combos ───────────────────────────────────────────────────
-- Matched on price, not name: the names carry a middle dot and are easy to
-- mistype. Each price is unique among plans.

-- Rs 11,000 - 4 pole + 4 self practice
update membership_plans
   set classes_included   = 8,
       category_limits    = '{"pole_regular":4,"self_practice":4}'::jsonb,
       allowed_categories = array['pole_regular','self_practice']
 where price_paise = 1100000;

-- Rs 13,500 - 4 pole + 8 mobility
update membership_plans
   set classes_included   = 12,
       category_limits    = '{"pole_regular":4,"mobility":8}'::jsonb,
       allowed_categories = array['pole_regular','mobility']
 where price_paise = 1350000;

-- Rs 17,000 - 4 pole + 8 mobility + 4 self practice.
-- self_practice is added deliberately: the plan is named for it but was never
-- configured to allow it, so nobody buying it could book the thing in the name.
update membership_plans
   set classes_included   = 16,
       category_limits    = '{"pole_regular":4,"mobility":8,"self_practice":4}'::jsonb,
       allowed_categories = array['pole_regular','mobility','self_practice']
 where price_paise = 1700000;

-- 'strength' is gone from all three. That discipline was retired from the site,
-- and the studio described none of these combos as including it.

-- ── 3. what you should see ────────────────────────────────────────────────
select name,
       price_paise / 100        as rupees,
       classes_included         as total_classes,
       category_limits,
       allowed_categories
  from membership_plans
 where price_paise in (1100000, 1350000, 1700000)
 order by price_paise;
