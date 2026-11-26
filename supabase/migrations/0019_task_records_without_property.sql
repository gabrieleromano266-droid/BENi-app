-- Records (receipts, invoices, photos) on a task that isn't tied to a home.
-- The existing files policy only matches rows whose property belongs to the
-- caller, so a record on a property-less task was silently refused.
create policy "Users can manage records on own tasks"
  on public.files
  for all
  to authenticated
  using (
    property_id is null
    and user_id = auth.uid()
    and task_id in (select id from public.tasks where user_id = auth.uid())
  )
  with check (
    property_id is null
    and user_id = auth.uid()
    and task_id in (select id from public.tasks where user_id = auth.uid())
  );
