-- 0018: proof, inspection dates, and the trusted-pros placeholder
-- APPLIED 2026-11-25. Founder feedback after the first clean test upload.
--
-- ── Proof (BENI-69) ─────────────────────────────────────────────────────────
-- "People want FACTS & PROOF." Every finding now carries the inspector's own
-- sentence, copied verbatim and CHECKED against the PDF text before it is
-- shown (an unverified quote is dropped, never displayed). It powers the
-- description, the page link, and the highlight in the report viewer — and it
-- is kept separate from `description` so a homeowner editing their notes can
-- never overwrite the evidence.
alter table public.tasks
  add column if not exists source_quote    text,
  add column if not exists severity_reason text;

comment on column public.tasks.source_quote is
  'Inspector''s exact words for this finding, verified to appear in the source PDF.';
comment on column public.tasks.severity_reason is
  'Plain-English reason for the severity, e.g. "Active leak — water damage and mould risk".';

-- ── Inspection date (BENI-70) ───────────────────────────────────────────────
-- Due dates were measured from the day of upload. A report from December 2018
-- uploaded today produced "due in 30 days" for things the inspector flagged
-- seven years ago. The date the home was inspected is the real anchor.
alter table public.files
  add column if not exists inspection_date date;

comment on column public.files.inspection_date is
  'Date the inspection was performed, read from the report and confirmed by the homeowner.';

-- ── Trusted pros (BENI-73) ──────────────────────────────────────────────────
-- Placeholder for the contractor pipeline: when the inspector says "recommend
-- repair by a qualified plumber", the task shows the plumbers BENi works with.
-- Empty to start; rows are added by hand from the Supabase table editor once a
-- contractor has agreed to be listed. Nothing is invented.
create table if not exists public.contractors (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  trade         text not null check (trade in (
                  'roofer', 'plumber', 'electrician', 'hvac', 'general',
                  'foundation', 'asbestos', 'pest', 'chimney', 'window', 'landscaping')),
  phone         text,
  website       text,
  service_area  text default 'Calgary',
  note          text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table public.contractors enable row level security;

-- Signed-in homeowners can read active listings; nobody can write through
-- the API — listings are curated in the dashboard.
drop policy if exists "Signed-in users can read active contractors" on public.contractors;
create policy "Signed-in users can read active contractors"
  on public.contractors for select
  to authenticated
  using (active);
