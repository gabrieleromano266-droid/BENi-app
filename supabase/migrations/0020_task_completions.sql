-- What actually happened when a task was done (BENI-78): when, what kind of
-- work, who did it, what it really cost, and a note. Snapshots BENi's own
-- estimate and catalog match alongside, so real Calgary prices can be compared
-- with what BENi predicted and the cost catalog can learn from them.
create table public.task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references public.tasks(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  completed_on date not null default current_date,
  action text check (action in ('repaired', 'replaced', 'serviced', 'inspected', 'other')),
  done_by text check (done_by in ('self', 'pro')),
  pro_name text check (char_length(pro_name) <= 120),
  cost_actual numeric(10, 2) check (cost_actual >= 0 and cost_actual < 1000000),
  notes text check (char_length(notes) <= 2000),
  task_title text,
  system text,
  severity text,
  catalog_id text,
  estimate_min integer,
  estimate_max integer,
  created_at timestamptz not null default now()
);

create index task_completions_user_idx on public.task_completions (user_id);
create index task_completions_catalog_idx on public.task_completions (catalog_id) where catalog_id is not null;

alter table public.task_completions enable row level security;

create policy "Users read own completions"
  on public.task_completions for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users add completions to own tasks"
  on public.task_completions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and task_id in (select id from public.tasks where user_id = (select auth.uid()))
  );

create policy "Users edit own completions"
  on public.task_completions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users delete own completions"
  on public.task_completions for delete to authenticated
  using (user_id = (select auth.uid()));
