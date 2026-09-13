-- Which findings came from the inspector's summary section.
-- The summary is where he says what actually matters; a finding repeated there
-- carries more weight than one buried in the per-room detail.
alter table public.tasks add column if not exists from_summary boolean not null default false;
create index if not exists tasks_from_summary_idx on public.tasks (from_summary) where from_summary;
comment on column public.tasks.from_summary is
  'True when the finding came from the report section with the highest density of recommendations (the inspector summary). Detected by density, not by heading - the template varies across reports.';
