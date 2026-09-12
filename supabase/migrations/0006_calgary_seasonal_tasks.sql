-- APPLIED 2026-09-12.
--
-- Widens the recurring bank using the published maintenance checklists
-- Gabriele collected, filtered for what actually matters in Calgary.
--
-- SOURCES MINED:
--   makeitright.ca (Mike Holmes, Canadian) — the most useful of the three;
--     it is the only one written for freeze-thaw climates.
--   kelleynan.com (US) — mostly cosmetic/US-centric (power-washing, lawn
--     over-seeding, re-painting on a 5-10 year cycle). Little of it survived
--     the filter below.
--   ama.ab.ca — could not be read; the page renders its checklist through
--     JavaScript and returns only navigation to a fetcher. Still worth a manual
--     pass, since AMA is the most Alberta-specific of the three.
--
-- WHAT I DELIBERATELY DID NOT ADD:
--   Cosmetic and lifestyle jobs (wash windows, power-wash the driveway, clean
--   the coffee maker, aerate the lawn). BENi's promise is protecting the
--   asset, and a plan padded with chores is a plan people stop reading.
--   Long-cycle replacements (repaint interior every 5-7 years) belong in the
--   life_expectancy table, not as recurring reminders.
--
-- THE FILTER APPLIED: does skipping this for one Calgary winter risk damage,
-- cost or safety? Everything below passes. Burst pipes and ice dams are the
-- two failures that turn into five-figure claims here, and neither was
-- represented in the original 19.

-- ── New features ────────────────────────────────────────────────────────────
insert into public.standard_features (name, keywords, is_common) values
  ('Exterior Water Taps',    array['hose bib','outdoor tap','spigot','sillcock'], true),
  ('Windows & Doors',        array['window','door','caulking','weatherstripping','screen'], true),
  ('Electrical Outlets & GFCIs', array['gfci','outlet','receptacle','breaker'], true),
  ('Fire Extinguisher',      array['extinguisher','fire'], true),
  ('Bathroom & Kitchen Fans', array['exhaust fan','range hood','bath fan','ventilation'], true)
on conflict do nothing;

-- ── Tasks on the new features ───────────────────────────────────────────────
insert into public.standard_tasks
  (feature_id, title, description, recur_frequency, recur_anchor, recur_interval, system, season, cost_min, cost_max)
select f.id, v.title, v.description, v.freq, 'due_date', v.interval, v.system, v.season, v.cost_min, v.cost_max
from (values
  ('Exterior Water Taps', 'Shut off and drain outdoor taps',
   'Close the indoor shut-off for each hose bib, disconnect the hose, and open the tap to drain it. Water left in the line freezes, expands and splits the pipe inside the wall — one of the most expensive and most preventable winter failures in Calgary.',
   'yearly', 1, 'plumbing', 'fall', 0, 0),

  ('Windows & Doors', 'Refresh caulking and weatherstripping',
   'Check the seal around every exterior window and door and re-caulk where it has cracked or pulled away. Cheap to fix, and it is where most of the heat leaves the house.',
   'yearly', 1, 'exterior', 'fall', 30, 200),

  ('Windows & Doors', 'Check and repair window screens',
   'Look for tears and gaps before the windows start being opened. Torn screens are how wasps and flies get in.',
   'yearly', 1, 'exterior', 'spring', 20, 150),

  ('Electrical Outlets & GFCIs', 'Test GFCI outlets',
   'Press TEST then RESET on every GFCI outlet — kitchen, bathrooms, garage, exterior. These are what stop a shock becoming an electrocution, and they do fail silently.',
   'monthly', 6, 'electrical', null, 0, 0),

  ('Fire Extinguisher', 'Check the fire extinguisher',
   'Confirm the gauge still reads green, the pin is intact, and it is somewhere you could actually reach in a kitchen fire. Most need replacing or servicing after about ten years.',
   'yearly', 1, 'interior', null, 0, 80),

  ('Bathroom & Kitchen Fans', 'Test and clean the exhaust fans',
   'Hold a sheet of tissue to the running fan — it should hold in place. A bathroom fan that no longer pulls is how moisture and mould build up through a Calgary winter with the windows shut.',
   'yearly', 1, 'hvac', null, 0, 120)
) as v(feature_name, title, description, freq, interval, system, season, cost_min, cost_max)
join public.standard_features f on f.name = v.feature_name
where not exists (
  select 1 from public.standard_tasks st where st.feature_id = f.id and st.title = v.title
);

-- ── Tasks added to features that already existed ────────────────────────────
insert into public.standard_tasks
  (feature_id, title, description, recur_frequency, recur_anchor, recur_interval, system, season, cost_min, cost_max)
select f.id, v.title, v.description, v.freq, 'due_date', v.interval, v.system, v.season, v.cost_min, v.cost_max
from (values
  ('Plumbing Fixtures', 'Insulate pipes in unheated areas',
   'Wrap any water line running through the garage, a crawlspace, or an exterior wall. A pipe that freezes there can burst without anyone noticing until it thaws.',
   'yearly', 1, 'plumbing', 'fall', 20, 150),

  ('Roof', 'Check for ice dams and icicles',
   'After a cold snap, look for large icicles or patches where snow has melted off the roof unevenly. Both mean heat is escaping into the attic and meltwater is refreezing at the eaves, which forces water back up under the shingles.',
   'yearly', 1, 'roof_attic', 'winter', 0, 0),

  ('Grading & Drainage', 'Repair cracks in walkways and the driveway',
   'Seal cracks before winter. Water gets in, freezes, expands, and turns a hairline crack into a trip hazard and a much bigger repair by spring.',
   'yearly', 1, 'exterior', 'fall', 50, 400)
) as v(feature_name, title, description, freq, interval, system, season, cost_min, cost_max)
join public.standard_features f on f.name = v.feature_name
where not exists (
  select 1 from public.standard_tasks st where st.feature_id = f.id and st.title = v.title
);

-- Correction to 0005: that migration matched on the title
-- 'Check the attic for moisture and insulation', but the seeded title ends
-- '...insulation gaps'. The UPDATE matched no rows and failed silently, leaving
-- the attic check seasonless. Checking the attic belongs in fall, before the
-- snow sits on it for five months.
update public.standard_tasks
set season = 'fall'
where title ilike 'Check the attic for moisture%';
