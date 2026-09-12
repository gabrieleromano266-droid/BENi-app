-- APPLIED 2026-09-13.
--
-- Lets the extractor fold a report's findings into the shared library in one
-- round trip.
--
-- This has to be a database function rather than a client upsert because the
-- interesting columns are COUNTERS. PostgREST can upsert a row, but it cannot
-- say "add one to whatever is already there", and doing it as read-then-write
-- from the Edge Function would both double the round trips and lose counts
-- whenever two uploads overlap.
--
-- Called with the service role by ExtractTasksUsingLLM, so it is SECURITY
-- INVOKER on purpose: no privilege is being granted to anyone else, and the
-- RLS policy on finding_library stays read-only for ordinary users.

create or replace function public.record_findings(findings jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  f jsonb;
  n integer := 0;
begin
  for f in select * from jsonb_array_elements(findings)
  loop
    insert into public.finding_library (
      normalized_key, canonical_title, times_seen, distinct_reports,
      suggested_kind, common_system, common_severity
    )
    values (
      f->>'key',
      f->>'title',
      1,
      1,
      f->>'kind',
      f->>'system',
      f->>'severity'
    )
    on conflict (normalized_key) do update
      set times_seen       = public.finding_library.times_seen + 1,
          -- One increment per report: the extractor de-duplicates before
          -- calling this, so a key appears at most once per upload.
          distinct_reports = public.finding_library.distinct_reports + 1,
          last_seen        = now(),
          -- Keep the longest wording seen. Inspectors abbreviate; the fuller
          -- phrasing is the more useful canonical label.
          canonical_title  = case
            when length(excluded.canonical_title) > length(public.finding_library.canonical_title)
              then excluded.canonical_title
            else public.finding_library.canonical_title
          end;
    n := n + 1;
  end loop;
  return n;
end;
$$;

comment on function public.record_findings(jsonb) is
  'Folds one report''s findings into finding_library, incrementing counters. Called by the extractor with the service role.';
