-- APPLIED 2026-09-12.
--
-- Makes the recurring-maintenance bank reachable.
--
-- THE PROBLEM: 16 standard_features and 19 standard_tasks were seeded, and the
-- code to attach them to a property works — but zero properties had ever used
-- it, because the only way in was My Properties -> open a property -> Manage
-- Features. Nobody finds that. The dashboard's "Recurring" tile counts tasks
-- with a recur_frequency, and there were none, so it read 0 forever. BENi
-- looked like a report parser rather than a maintenance companion.
--
-- TWO ADDITIONS:
--
-- is_common — which features essentially every detached home has, so BENi can
-- set up a sensible plan in one tap instead of asking sixteen questions. The
-- conditional ones (air conditioning, a deck, a sump pump, a fireplace) stay
-- opt-in, because inventing a chimney sweep for a house with no chimney is
-- worse than asking.
--
-- season — when the job actually wants doing in Calgary. NULL means "anytime",
-- which is the honest answer for things on a fixed clock: a furnace filter is
-- due every three months regardless of the weather. Only genuinely seasonal
-- work is tagged, so a future "it's fall, here are your 6 fall jobs" prompt is
-- driven by data rather than a hardcoded list.

alter table public.standard_features
  add column if not exists is_common boolean not null default false;

alter table public.standard_tasks
  add column if not exists season text
  check (season is null or season in ('spring', 'summer', 'fall', 'winter'));

-- Every home: the building envelope, the things that burn or leak, and the
-- alarms that tell you about it.
update public.standard_features set is_common = true
where name in (
  'Attic',
  'Clothes Dryer',
  'Forced Air Furnace',
  'Grading & Drainage',
  'Gutters & Downspouts',
  'Plumbing Fixtures',
  'Roof',
  'Smoke & CO Alarms',
  'Tank Water Heater'
);

-- Calgary seasonality. Fall carries the most weight because winter here is the
-- thing you prepare for.
update public.standard_tasks set season = 'fall'
where title in (
  'Book annual furnace service',
  'Book a chimney sweep and inspection',
  'Service the gas fireplace',
  'Check the attic for moisture and insulation',
  'Clean gutters and downspouts',
  'Replace smoke and CO alarm batteries'
);

update public.standard_tasks set season = 'spring'
where title in (
  'Check grading and clear window wells',
  'Inspect the roof from the ground',
  'Test the sump pump',
  'Inspect the deck structure',
  'Clean the AC condenser and book a service'
);

update public.standard_tasks set season = 'summer'
where title in ('Clean and reseal the deck');

comment on column public.standard_features.is_common is
  'True for features essentially every detached home has, so a starter plan can be created without interrogating the homeowner.';
comment on column public.standard_tasks.season is
  'Calgary season this job belongs to, or NULL for work on a fixed clock (e.g. a filter every 3 months).';
