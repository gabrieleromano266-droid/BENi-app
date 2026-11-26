/**
 * Re-date a task from an inspection date — the client copy of scheduleTasks()
 * in the ExtractTasksUsingLLM Edge Function (BENI-70).
 *
 * The server dates everything from the inspection date it reads off the
 * report. If the homeowner corrects that date on the confirm screen, the
 * tasks have to move with it, without another trip through the AI. Edge
 * Functions can't import app code, so the rules live in both places: if you
 * change one, change the other.
 *
 *   - jobs: inspection + the window the report allows; if that has passed,
 *     due soon (14/30/60 days by severity) and flagged "carried over"
 *   - upkeep: inspection + one interval; if that has passed, due in 30 days
 */
import { RecurFrequency, TaskType } from '@/types';

const DAY = 86_400_000;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function plusDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY);
}

function plusInterval(d: Date, f: RecurFrequency, n: number): Date {
  const out = new Date(d);
  if (f === 'daily') out.setDate(out.getDate() + n);
  else if (f === 'weekly') out.setDate(out.getDate() + 7 * n);
  else if (f === 'monthly') out.setMonth(out.getMonth() + n);
  else out.setFullYear(out.getFullYear() + n);
  return out;
}

function catchUpDays(severity: TaskType['severity']): number {
  return severity === 'critical' ? 14 : severity === 'moderate' ? 30 : 60;
}

/** Parse YYYY-MM-DD as a local date (not UTC midnight, which shifts a day west of Greenwich). */
export function localDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function rescheduleFromInspection(task: TaskType, inspectionIso: string): TaskType {
  const today = startOfToday();
  const base = localDate(inspectionIso);

  if (task.recurFrequency) {
    const next = plusInterval(base, task.recurFrequency, task.recurInterval ?? 1);
    return next < today
      ? { ...task, dueDate: plusDays(today, 30), carriedOver: true }
      : { ...task, dueDate: next, carriedOver: false };
  }

  if (task.dueWindowDays == null) return task; // a date the report itself stated, or a note

  const target = plusDays(base, task.dueWindowDays);
  return target < today
    ? { ...task, dueDate: plusDays(today, catchUpDays(task.severity)), carriedOver: true }
    : { ...task, dueDate: target, carriedOver: false };
}

/** "December 2018 · 7 years ago" style age of a report, in whole years. */
export function yearsSince(iso: string): number {
  const d = localDate(iso);
  return Math.floor((Date.now() - d.getTime()) / (365.25 * DAY));
}
