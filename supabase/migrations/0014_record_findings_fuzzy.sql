-- APPLIED 2026-09-13.
--
-- record_findings now joins a finding to an EXISTING library row when the
-- wording is close enough, instead of demanding an exact key match. Without
-- this, near-identical phrasings fragment and distinct_reports never climbs,
-- which means the boilerplate signal never fires.
--
-- 0.6, looser than the 0.7 the extractor uses within a single report: two
-- reports are written months apart about different houses, so the same
-- underlying issue diverges in wording more than two sentences on one page do.
create or replace function public.record_findings(findings jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  f        jsonb;
  toks     text[];
  hit      uuid;
  n        integer := 0;
begin
  for f in select * from jsonb_array_elements(findings)
  loop
    toks := string_to_array(f->>'key', ' ');

    -- Fast path: exactly this wording has been seen before.
    select id into hit
    from public.finding_library
    where normalized_key = f->>'key'
    limit 1;

    -- Fallback: close enough to something already in the library. Requires a
    -- shared token first so the index does the heavy lifting rather than
    -- scoring every row.
    if hit is null then
      select id into hit
      from public.finding_library
      where tokens && toks
        and public.token_overlap(tokens, toks) >= 0.6
      order by public.token_overlap(tokens, toks) desc
      limit 1;
    end if;

    if hit is null then
      insert into public.finding_library (
        normalized_key, canonical_title, tokens, times_seen, distinct_reports,
        suggested_kind, common_system, common_severity
      ) values (
        f->>'key', f->>'title', toks, 1, 1,
        f->>'kind', f->>'system', f->>'severity'
      );
    else
      update public.finding_library
      set times_seen       = times_seen + 1,
          distinct_reports = distinct_reports + 1,
          last_seen        = now(),
          canonical_title  = case
            when length(f->>'title') > length(canonical_title)
              then f->>'title' else canonical_title end
      where id = hit;
    end if;

    n := n + 1;
  end loop;
  return n;
end;
$$;
