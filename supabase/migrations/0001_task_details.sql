-- SUPERSEDED / ALREADY APPLIED (2026-09-07).
-- These columns now live in the Supabase-tracked migrations
-- 'add_rich_task_fields_and_indexes' and 'align_tasks_schema_with_app_code',
-- which also add `recurrence`, the FK indexes and the corrected RLS policy.
-- Do NOT run this by hand: the two ADD CONSTRAINT statements below have no
-- IF NOT EXISTS and will error because those constraints already exist.

-- Adds the fields the redesigned dashboard needs: which home system a task
-- belongs to, its severity (feeds the Home Health Score), and the
-- where/what/fix/cost/timing detail shown when a maintenance-plan card is
-- expanded. All columns are nullable — existing rows and the existing app
-- code keep working unchanged.
--
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query)
-- against the live database. This repo has no Supabase CLI/migration runner
-- wired up, so it will not run itself.

alter table tasks
  add column if not exists system text,
  add column if not exists severity text,
  add column if not exists location text,
  add column if not exists issue text,
  add column if not exists fix_recommendation text,
  add column if not exists cost_min integer,
  add column if not exists cost_max integer,
  add column if not exists timing_note text;

-- Postgres has no "ADD CONSTRAINT IF NOT EXISTS"; if you re-run this script,
-- drop these two constraints first or skip them if already present.
alter table tasks
  add constraint tasks_system_check
    check (system is null or system in ('roof_attic', 'electrical', 'plumbing', 'hvac', 'exterior', 'interior'));

alter table tasks
  add constraint tasks_severity_check
    check (severity is null or severity in ('critical', 'moderate', 'minor'));
