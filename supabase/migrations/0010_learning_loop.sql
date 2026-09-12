-- APPLIED 2026-09-13.
--
-- BENi's memory. Two tables, and they do different jobs.
--
-- ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
-- Today every report is processed from scratch: same prompt, same catalog. The
-- hundredth report is handled exactly like the first. Nothing accumulates.
--
-- The fix is NOT to feed old reports back to the model. It is to build, from
-- the corpus, a canonical vocabulary of what inspectors actually say — and to
-- record what homeowners then DO with each finding. Those two together are
-- what make the hundredth report better than the first.
--
-- The important property: both tables fill themselves. `finding_library` is
-- written by the extractor on every upload; `task_events` is written when a
-- user deletes or completes something. Neither needs anyone to sit and label
-- data. Volume alone makes them useful.
--
-- Instrument NOW, analyse later. With three reports the statistics mean
-- nothing. With fifty they mean a great deal — but only if collection started
-- before the fifty, which is the whole point of building this early.

-- ── 1. What homeowners DO with findings ────────────────────────────────────
-- Every delete is a homeowner saying "that was not worth telling me". Every
-- completion is one saying "that was real, and here is what it cost". This is
-- labelled training data that costs the user nothing to produce.
create table if not exists public.task_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  task_id     uuid,
  file_id     uuid,
  event       text not null check (event in ('deleted', 'completed', 'edited', 'restored')),
  reason      text,

  -- Snapshot, because the point of a 'deleted' event is that the task row is
  -- about to disappear. A foreign key to something gone teaches us nothing.
  task_title      text not null,
  task_kind       text,
  severity        text,
  system          text,
  catalog_id      uuid,
  source_page     integer,
  cost_min        integer,
  cost_max        integer,
  days_until_due  integer,

  created_at  timestamptz not null default now()
);

create index if not exists task_events_user_idx on public.task_events (user_id);
create index if not exists task_events_event_idx on public.task_events (event);
create index if not exists task_events_created_idx on public.task_events (created_at desc);

alter table public.task_events enable row level security;

-- A user may record and read their own events. Deliberately no UPDATE or
-- DELETE policy: an event log you can rewrite is not evidence.
drop policy if exists "own task events insert" on public.task_events;
create policy "own task events insert" on public.task_events
  for insert with check (user_id = auth.uid());

drop policy if exists "own task events select" on public.task_events;
create policy "own task events select" on public.task_events
  for select using (user_id = auth.uid());

-- ── 2. The canonical vocabulary of findings ────────────────────────────────
-- One row per DISTINCT thing an inspector says, across every report BENi has
-- ever read, keyed by the same normalised token form the de-duplicator uses.
--
-- The counts are what make this valuable, and one in particular:
-- `distinct_reports`. A finding that appears in most reports is the
-- inspector's template boilerplate ("recommend routine servicing"), not a
-- defect at that house. A finding that appears in one or two reports is
-- genuinely specific. **That distinction is computable with no human and no
-- AI**, and it is the single biggest lever on "100 findings is overwhelming".
create table if not exists public.finding_library (
  id               uuid primary key default gen_random_uuid(),
  normalized_key   text not null unique,
  canonical_title  text not null,

  times_seen       integer not null default 0,
  distinct_reports integer not null default 0,
  deleted_count    integer not null default 0,
  completed_count  integer not null default 0,

  -- What the rules concluded, so drift in classification is visible over time.
  suggested_kind   text,
  common_system    text,
  common_severity  text,

  first_seen       timestamptz not null default now(),
  last_seen        timestamptz not null default now()
);

create index if not exists finding_library_reports_idx
  on public.finding_library (distinct_reports desc);
create index if not exists finding_library_deleted_idx
  on public.finding_library (deleted_count desc);

-- Read-only to signed-in users; only the extractor (service role, which
-- bypasses RLS) writes to it. It is shared knowledge, not user data.
alter table public.finding_library enable row level security;

drop policy if exists "library readable" on public.finding_library;
create policy "library readable" on public.finding_library
  for select using (auth.uid() is not null);

comment on table public.task_events is
  'What homeowners do with findings. Deletions are the label for "bad extraction"; completions for "real and actionable". Append-only on purpose.';
comment on table public.finding_library is
  'One row per distinct finding across every report processed. distinct_reports separates inspector boilerplate from property-specific defects, with no human and no AI.';
