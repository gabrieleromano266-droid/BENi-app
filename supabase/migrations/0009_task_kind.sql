-- APPLIED 2026-09-13.
--
-- An inspection report mixes three kinds of statement, and BENi was turning all
-- of them into dated tasks. That is the main reason a single report produces a
-- plan of 150+ items that nobody reads.
--
--   action  - a specific job at this address, with a beginning and an end.
--             "Backfill the garage foundation." This is the maintenance plan.
--
--   routine - ongoing upkeep stated as general advice. "Replace the HVAC
--             filters routinely." A due date here is a lie: it is never
--             "done". It belongs on a cadence, in the recurring plan.
--
--   note    - not something the homeowner does to the house at all. "Obtain
--             maintenance records and warranties." Worth keeping; not a chore,
--             and it must never carry a due date.
--
-- Classified by rules rather than by the model, because the distinction lives
-- in the GRAMMAR of the sentence — a cadence adverb ("routinely"), a
-- record-keeping verb ("obtain ... warranties"). Patterns are good at that and
-- consistent about it; an LLM is neither, and this extraction prompt has
-- degraded before when asked to do two jobs at once.
--
-- Measured on 234 real extracted tasks: 87% action, 12% routine, 1% note, and
-- nothing left unclassified.

alter table public.tasks
  add column if not exists task_kind text
  check (task_kind is null or task_kind in ('action', 'routine', 'note'));

create index if not exists tasks_task_kind_idx on public.tasks (task_kind);

comment on column public.tasks.task_kind is
  'What the inspector was actually saying: action (a job to do), routine (ongoing upkeep, belongs on a cadence), or note (informational, never dated).';

-- Tasks created from the recurring bank are routine by definition — they were
-- generated FROM a cadence, so no text classification is needed for them.
update public.tasks
set task_kind = 'routine'
where task_kind is null and recur_frequency is not null;
