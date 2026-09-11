-- APPLIED 2026-09-10.
--
-- Lets a homeowner group documents into folders ("Receipts", "Warranties",
-- "Insurance") instead of one flat list that grows forever.
--
-- A folder is its own row rather than just a text column on `files`, so an
-- empty folder can exist: you create the folder first, then put things in it.
-- A text column could only ever describe a folder that already had a file in
-- it, which is backwards from how people actually organise.
--
-- Deleting a folder does NOT delete the documents inside it — `on delete set
-- null` returns them to the top level. Losing files because you tidied up a
-- folder name would be an unpleasant surprise.

create table if not exists public.document_folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

alter table public.files
  add column if not exists folder_id uuid
  references public.document_folders (id) on delete set null;

create index if not exists files_folder_id_idx on public.files (folder_id);
create index if not exists document_folders_user_id_idx on public.document_folders (user_id);

-- Two folders with the same name in one account would be indistinguishable in
-- the UI, so forbid it rather than letting it happen silently.
create unique index if not exists document_folders_user_name_idx
  on public.document_folders (user_id, lower(name));

alter table public.document_folders enable row level security;

drop policy if exists "own folders" on public.document_folders;
create policy "own folders" on public.document_folders
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.document_folders is
  'User-created folders for grouping documents. Deleting one leaves its files in place, unfiled.';
