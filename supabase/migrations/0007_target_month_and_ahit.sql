-- APPLIED 2026-09-13.
--
-- TWO CHANGES: stop every seasonal job landing on the same day, and fold in the
-- AHIT checklist.
--
-- ── 1. THE DATE CLUSTERING BUG ──────────────────────────────────────────────
-- `season` alone was too blunt. firstDueDate() scheduled every fall job for the
-- first day of fall, so ten tasks all landed on 22 September and the plan read
-- like one enormous deadline. A homeowner cannot act on that, and a
-- notification listing ten things on one morning gets dismissed as noise.
--
-- target_month is the real answer, and it is more honest as well as more
-- spread out: these jobs genuinely have their own timing in Calgary. Furnace
-- service wants doing in September BEFORE every furnace company is booked
-- solid. Gutters want doing in October AFTER the leaves are actually down.
-- Sump pumps want testing in March before the melt. Ice dams cannot be checked
-- until there is snow on the roof, so January.
--
-- Calgary's first hard frost is usually late September, which is why draining
-- the outdoor taps sits at the end of September rather than "sometime in fall".
--
-- season is kept: it is what groups the jobs for an "it's fall, here are your
-- fall jobs" view. target_month is what dates them.
--
-- ── 2. AHIT CHECKLIST (AHIT.com, 2024) ──────────────────────────────────────
-- Organised by Monthly / Annually / 3-5 Years / Spring / Summer / Fall /
-- Winter. It is season-based rather than month-specific, so it did not supply
-- the months above — those come from Calgary's actual climate.
--
-- It independently confirmed the two items added yesterday (drain outdoor
-- faucets, insulate exposed pipes), which is reassuring: three sources now
-- agree those matter.
--
-- Added below are the items it had that we did not, filtered as before on
-- "does skipping this risk damage, cost or safety?". The washing-machine hose
-- is the standout: a burst hose is one of the most common household flood
-- claims there is, it fails without warning, and almost nobody replaces them
-- on a schedule.
--
-- Rejected from AHIT as chores rather than asset protection: deep clean home,
-- clean carpets, clean the grill, clean flower beds, wash windows, deep clean
-- the dishwasher, clean the oven. Septic tank items were skipped as
-- city-of-Calgary homes are on sewer.

alter table public.standard_tasks
  add column if not exists target_month integer
  check (target_month is null or (target_month between 1 and 12));

comment on column public.standard_tasks.target_month is
  'Month (1-12) this job is best done in Calgary. NULL for work on a fixed clock. Drives the first due date; `season` is for grouping.';

-- ── Month assignments for the existing bank ─────────────────────────────────
update public.standard_tasks set target_month = 9  where title = 'Book annual furnace service';
update public.standard_tasks set target_month = 9  where title = 'Refresh caulking and weatherstripping';
update public.standard_tasks set target_month = 9  where title = 'Repair cracks in walkways and the driveway';
update public.standard_tasks set target_month = 9  where title = 'Shut off and drain outdoor taps';
update public.standard_tasks set target_month = 10 where title = 'Clean gutters and downspouts';
update public.standard_tasks set target_month = 10 where title ilike 'Check the attic for moisture%';
update public.standard_tasks set target_month = 10 where title = 'Book a chimney sweep and inspection';
update public.standard_tasks set target_month = 10 where title = 'Service the gas fireplace';
update public.standard_tasks set target_month = 10 where title = 'Insulate pipes in unheated areas';
update public.standard_tasks set target_month = 11 where title = 'Replace smoke and CO alarm batteries';
update public.standard_tasks set target_month = 1  where title = 'Check for ice dams and icicles';
update public.standard_tasks set target_month = 3  where title = 'Test the sump pump';
update public.standard_tasks set target_month = 4  where title = 'Check grading and clear window wells';
update public.standard_tasks set target_month = 4  where title = 'Check and repair window screens';
update public.standard_tasks set target_month = 5  where title = 'Inspect the roof from the ground';
update public.standard_tasks set target_month = 5  where title = 'Inspect the deck structure';
update public.standard_tasks set target_month = 5  where title = 'Clean the AC condenser and book a service';
update public.standard_tasks set target_month = 6  where title = 'Flush the water heater tank';
update public.standard_tasks set target_month = 7  where title = 'Clean and reseal the deck';
update public.standard_tasks set target_month = 8  where title = 'Clean the dryer vent duct';

-- ── New features from AHIT ──────────────────────────────────────────────────
insert into public.standard_features (name, keywords, is_common) values
  ('Washing Machine',  array['washer','washing machine','laundry hose'], true),
  ('Dishwasher',       array['dishwasher'], true),
  ('Trees & Shrubs',   array['tree','shrub','branch','landscaping'], true),
  ('Home Insurance',   array['insurance','policy','coverage'], true)
on conflict do nothing;

insert into public.standard_tasks
  (feature_id, title, description, recur_frequency, recur_anchor, recur_interval, system, season, target_month, cost_min, cost_max)
select f.id, v.title, v.description, v.freq, 'due_date', v.interval, v.system, v.season, v.month, v.cost_min, v.cost_max
from (values
  ('Washing Machine', 'Replace the washing machine hoses',
   'Rubber supply hoses harden and split with age, usually with no warning and while nobody is home. A burst hose delivers mains-pressure water until someone finds it. Braided stainless hoses cost about $30 a pair and are one of the cheapest disasters you can prevent.',
   'yearly', 5, 'plumbing', null, 4, 30, 120),

  ('Washing Machine', 'Check the washing machine hoses and connections',
   'Look behind the machine for bulges, rust at the fittings, damp patches or drips. Replace immediately if anything looks swollen.',
   'yearly', 1, 'plumbing', 'winter', 1, 0, 0),

  ('Dishwasher', 'Check the dishwasher hose for leaks',
   'Look under the sink and at the back of the machine for damp, staining or a soft spot in the cabinet floor. Slow dishwasher leaks rot the cabinet and subfloor long before anyone notices.',
   'yearly', 1, 'plumbing', 'winter', 2, 0, 0),

  ('Trees & Shrubs', 'Trim branches back from the house',
   'Keep branches off the roof, siding and gutters. They scrape shingles, hold moisture against the wall, and give squirrels a bridge into the attic. Heavy Calgary snow turns an overhanging branch into a real hazard.',
   'yearly', 1, 'exterior', 'spring', 5, 0, 500),

  ('Home Insurance', 'Review your home insurance policy',
   'Check your coverage still matches what the home would cost to rebuild, and confirm whether you have sewer backup and overland water coverage — both are commonly excluded by default and both are Calgary risks.',
   'yearly', 1, 'interior', null, 2, 0, 0)
) as v(feature_name, title, description, freq, interval, system, season, month, cost_min, cost_max)
join public.standard_features f on f.name = v.feature_name
where not exists (
  select 1 from public.standard_tasks st where st.feature_id = f.id and st.title = v.title
);

-- ── New tasks on features that already existed ──────────────────────────────
insert into public.standard_tasks
  (feature_id, title, description, recur_frequency, recur_anchor, recur_interval, system, season, target_month, cost_min, cost_max)
select f.id, v.title, v.description, v.freq, 'due_date', v.interval, v.system, v.season, v.month, v.cost_min, v.cost_max
from (values
  ('Grading & Drainage', 'Check downspouts drain away from the house',
   'Each downspout should discharge at least four feet from the foundation. Calgary sits on clay that swells and shrinks with moisture, so water dumped at the wall is how basements end up wet and foundations end up moving.',
   'yearly', 1, 'exterior', 'spring', 4, 0, 150),

  ('Plumbing Fixtures', 'Inspect toilet supply lines and valves',
   'Check the flexible line and shut-off valve behind each toilet for corrosion, stiffness or seepage. These are cheap to replace and expensive to ignore.',
   'yearly', 1, 'plumbing', null, 3, 0, 60),

  ('Electrical Outlets & GFCIs', 'Check for damaged electrical cords',
   'Walk the house looking for frayed, pinched or warm cords, and for anything run under a rug or through a doorway. Damaged cords are a leading cause of house fires.',
   'yearly', 1, 'electrical', 'summer', 7, 0, 0),

  ('Windows & Doors', 'Check the exterior for rotting wood',
   'Press a screwdriver into trim, sills and any wood near the ground. If it goes in easily the wood is gone and water is getting somewhere it should not.',
   'yearly', 1, 'exterior', 'summer', 6, 0, 0)
) as v(feature_name, title, description, freq, interval, system, season, month, cost_min, cost_max)
join public.standard_features f on f.name = v.feature_name
where not exists (
  select 1 from public.standard_tasks st where st.feature_id = f.id and st.title = v.title
);
