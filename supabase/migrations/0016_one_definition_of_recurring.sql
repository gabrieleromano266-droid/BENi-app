-- 0016: one definition of "recurring" (BENI-53) + classic seasonal upkeep (BENI-57)
-- APPLIED 2026-11-16. Row counts for each step are in the session recap.
--
-- ── BENI-53 ─────────────────────────────────────────────────────────────────
-- The dashboard's Recurring tile counted tasks WITH A CADENCE; the plan's
-- "Routine upkeep" chip counted task_kind = 'routine'. Two definitions, two
-- numbers (20 vs 37 on Gabriele's home). Two causes in the data:
--   * recurring-plan tasks (featureService.addFeatureToProperty) were inserted
--     with no task_kind at all, so the app treated them as "To do";
--   * routine findings from reports often had no cadence, because the
--     inspector wrote "monitor" or "maintain" without saying how often.
--
-- Rule from here on: a task with a cadence IS routine, and a routine task HAS
-- a cadence — annual by default, because "check it once a year" is what an
-- inspector means by "monitor". Both counts now read the same set.

-- 1. Anything on a schedule is routine.
update public.tasks
   set task_kind = 'routine'
 where recur_frequency is not null
   and task_kind is distinct from 'routine';

-- 2. Routine findings with no cadence get one. Many already carry the
--    inspector's phrase in `recurrence` ("Every 3 months", "annually") that
--    was stored as text and never became a schedule — read that first, and
--    only fall back to an annual check when the phrase says nothing.
update public.tasks
   set recur_frequency = case
         when recurrence ~* '(dai|\mday)'  then 'daily'
         when recurrence ~* 'week'         then 'weekly'
         when recurrence ~* 'month'        then 'monthly'
         else 'yearly'
       end,
       recur_interval  = coalesce(nullif(substring(recurrence from '\d+'), '')::int, 1),
       recur_anchor    = coalesce(recur_anchor, 'due_date')
 where task_kind = 'routine'
   and recur_frequency is null
   and completed_at is null;

-- 3. A routine task with a cadence but no due date can never remind anyone —
--    the bell (and the coming email digest) run on due_date. First occurrence
--    is one interval from today.
update public.tasks
   set due_date = (current_date + case recur_frequency
       when 'daily'   then make_interval(days   => coalesce(recur_interval, 1))
       when 'weekly'  then make_interval(weeks  => coalesce(recur_interval, 1))
       when 'monthly' then make_interval(months => coalesce(recur_interval, 1))
       else                make_interval(years  => coalesce(recur_interval, 1))
     end)::date
 where task_kind = 'routine'
   and recur_frequency is not null
   and due_date is null
   and completed_at is null;

-- ── BENI-57: classic seasonal upkeep from the InterNACHI homeowner book ─────
-- Source: "The Homeowner Maintenance Book — Now That You've Had a Home
-- Inspection", Chapter 11 (Checklists for the Seasons), in BENi Knowledge Base.
-- Same filter as 0006: would skipping this for one Calgary winter risk damage,
-- cost or safety? Items the bank already covered (furnace service, gutters,
-- alarms, appliance hoses, caulking, extinguisher, cords, GFCIs, water heater,
-- chimney) were left alone rather than duplicated.
-- Chapter 12 (service-life expectancies by component) is a future data source
-- for "what's likely next" — noted, not seeded.

insert into public.standard_features (name, keywords, is_common) values
  ('Kitchen Range Hood', array['range hood','exhaust hood','hood filter'],         true),
  ('Emergency Shutoffs', array['shutoff','shut-off','gas valve','water main'],     true),
  ('Lawn Equipment',     array['lawn mower','snow blower','gas-powered'],          false),
  ('Play Structure',     array['play structure','swing set','playground'],         false)
on conflict do nothing;

insert into public.standard_tasks
  (feature_id, title, description, recur_frequency, recur_anchor, recur_interval, system, season, target_month, cost_min, cost_max)
select f.id, v.title, v.description, v.freq, 'due_date', v.interval, v.system, v.season, v.target_month, v.cost_min, v.cost_max
from (values
  ('Kitchen Range Hood', 'Clean the range hood filter',
   'Grease in the filter is a fire load right above the stove, and it makes the fan useless. Most mesh filters go through the dishwasher.',
   'monthly', 6, 'interior', null, null, 0, 40),
  ('Smoke & CO Alarms', 'Walk through the fire escape plan with everyone at home',
   'Two ways out of every bedroom and one meeting spot outside. Five minutes, once a year, before furnace season.',
   'yearly', 1, 'interior', 'fall', 10, 0, 0),
  ('Plumbing Fixtures', 'Exercise the shutoff valves under sinks and toilets',
   'A valve that has not been turned in years seizes — and you find out the night a supply line lets go. Close and reopen each one.',
   'yearly', 1, 'plumbing', 'spring', 5, 0, 0),
  ('Plumbing Fixtures', 'Check the caulking around tubs and showers',
   'A hairline gap lets water into the subfloor every shower. Re-caulk any joint that is cracked, dark or pulling away.',
   'yearly', 1, 'interior', 'fall', 10, 0, 30),
  ('Windows & Doors', 'Check that every window and door lock works',
   'Locks that stick or will not latch are a security gap and, on windows, a sign the frame has shifted.',
   'yearly', 1, 'exterior', 'summer', 7, 0, 0),
  ('Emergency Shutoffs', 'Show everyone at home where the gas and water shutoffs are',
   'The main water valve and the gas meter valve. In a burst-pipe or gas-smell emergency, whoever is home needs to find them in under a minute.',
   'yearly', 1, 'plumbing', 'winter', 1, 0, 0),
  ('Lawn Equipment', 'Run gas-powered equipment dry before winter storage',
   'Fuel left in a mower or trimmer over winter gums up the carburetor. Run it until it stops, or add stabiliser.',
   'yearly', 1, 'exterior', 'fall', 10, 0, 15),
  ('Play Structure', 'Check the play structure for loose bolts and rot',
   'Tighten hardware, look for splintering and rot where wood meets ground, and check the anchors before the kids are out on it.',
   'yearly', 1, 'exterior', 'spring', 5, 0, 50)
) as v(feature_name, title, description, freq, interval, system, season, target_month, cost_min, cost_max)
join public.standard_features f on f.name = v.feature_name
where not exists (
  select 1 from public.standard_tasks st where st.feature_id = f.id and st.title = v.title
);

-- Homes that already opted into the recurring plan get the two new COMMON
-- jobs, so an existing user is not stuck with the old bank. Seasonal ones land
-- in their month; the rest one interval out. Uncommon features (lawn
-- equipment, play structure) stay opt-in from the property's feature list.
insert into public.property_features (property_id, feature_id)
select distinct pf.property_id, f.id
  from public.property_features pf
  join public.standard_features f on f.name in ('Kitchen Range Hood', 'Emergency Shutoffs')
 where not exists (
   select 1 from public.property_features x where x.property_id = pf.property_id and x.feature_id = f.id
 );

insert into public.tasks
  (user_id, property_id, title, description, recur_frequency, recur_anchor, recur_interval,
   due_date, system, cost_min, cost_max, task_kind)
select p.user_id, p.id, st.title, st.description, st.recur_frequency, st.recur_anchor, st.recur_interval,
       case
         when st.target_month is null then
           (current_date + case st.recur_frequency
              when 'monthly' then make_interval(months => coalesce(st.recur_interval, 1))
              else                make_interval(years  => coalesce(st.recur_interval, 1))
            end)::date
         when st.target_month = extract(month from current_date)::int then current_date + 14
         else (date_trunc('month', current_date)
               + make_interval(months => (st.target_month - extract(month from current_date)::int + 12) % 12))::date
       end,
       st.system, st.cost_min, st.cost_max, 'routine'
  from public.properties p
  join public.property_features pf on pf.property_id = p.id
  join public.standard_features f  on f.id = pf.feature_id and f.name in ('Kitchen Range Hood', 'Emergency Shutoffs')
  join public.standard_tasks st    on st.feature_id = f.id
 where not exists (
   select 1 from public.tasks t where t.property_id = p.id and t.title = st.title
 );
