-- APPLIED 2026-09-13.
--
-- THE BLOCKER: finding_library keyed on an EXACT normalised token string, so
-- "Repair or replace damaged cladding" and "Repair damaged brick cladding"
-- became two rows. distinct_reports therefore never climbed past 1, and the
-- boilerplate detector -- the whole point of the library -- could never fire.
-- Measured across two different properties: 157 rows, exactly ONE shared.
--
-- The fix is to let a finding join an EXISTING library row when it overlaps
-- enough, the same way the extractor already de-duplicates within one report.
-- Exact-key lookup stays as the fast path; the overlap search is the fallback.
--
-- Postgres does the matching because the library lives here and grows without
-- bound; shipping it to the Edge Function would mean fetching every row on
-- every upload.

-- Token array alongside the key, so overlap can be computed in the database.
alter table public.finding_library
  add column if not exists tokens text[] not null default '{}';

create index if not exists finding_library_tokens_idx
  on public.finding_library using gin (tokens);

-- Backfill from the keys we already stored (they are space-joined tokens).
update public.finding_library
set tokens = string_to_array(normalized_key, ' ')
where tokens = '{}' and normalized_key <> '';

/*
 * Jaccard overlap of two token arrays: shared / (union).
 * Immutable and tiny, so it can sit inside an index-assisted scan.
 */
create or replace function public.token_overlap(a text[], b text[])
returns numeric
language sql
immutable
as $$
  select case
    when a is null or b is null or array_length(a,1) is null or array_length(b,1) is null then 0
    else (
      select count(*)::numeric
      from (select unnest(a) intersect select unnest(b)) s
    ) / nullif((
      select count(*)::numeric
      from (select unnest(a) union select unnest(b)) u
    ), 0)
  end;
$$;
