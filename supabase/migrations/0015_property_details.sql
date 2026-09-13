-- APPLIED 2026-09-13.
--
-- A home was just a name. The first real user (Gabriele's dad) was asked for
-- "property name" with no idea what to type, and BENi learned nothing about
-- the house it was about to give advice on.
--
-- These three are asked during onboarding because a homeowner knows them
-- without looking anything up, and each earns its place:
--
--   address              - what people actually call their home, and the thing
--                          that makes a maintenance record transferable at sale
--   year_built           - drives life expectancy. A 1978 furnace and a 2021
--                          furnace need completely different advice, and today
--                          BENi cannot tell them apart
--   last_inspection_date - tells us how stale the findings are, and when the
--                          next inspection is due
--
-- All nullable: every one of them is optional at onboarding, because a signup
-- form that interrogates people is a signup form they abandon.

alter table public.properties
  add column if not exists address              text,
  add column if not exists year_built           integer,
  add column if not exists last_inspection_date date;

comment on column public.properties.year_built is
  'Drives life-expectancy advice: a 1978 furnace and a 2021 furnace are different problems.';
