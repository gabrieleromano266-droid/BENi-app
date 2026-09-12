-- APPLIED 2026-09-13.
--
-- NEW ACCOUNTS COULD NOT CREATE THEIR PROFILE.
--
-- public.profiles had exactly two policies: SELECT own, UPDATE own. There was
-- no INSERT policy, and no trigger on auth.users to create the row either
-- (checked: zero non-internal triggers matching '%new_user%').
--
-- app/(auth)/register.tsx signs the user up and then upserts their name into
-- profiles. An upsert is an INSERT, so RLS refused it, and the very first
-- thing a brand-new user saw after filling in the form was:
--
--   "Profile Error: new row violates row-level security policy for table
--    profiles — please sign in to update your profile."
--
-- It never showed up in testing because every existing account already had a
-- profile row, created back when the table was populated by hand. Only a
-- genuinely new signup hits this.
--
-- The policy is deliberately narrow: a user may insert exactly one row, and
-- only one whose id is their own auth uid. They cannot create a profile for
-- anybody else.

drop policy if exists "Users can create own profile" on public.profiles;
create policy "Users can create own profile" on public.profiles
  for insert
  with check (auth.uid() = id);

-- Backfill anyone who registered while this was broken and therefore has an
-- auth account but no profile row.
insert into public.profiles (id)
select u.id
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;
