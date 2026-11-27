import { DBTask, RecurAnchor, RecurFrequency, TaskType } from '@/types';

/** Sort tasks ascending by due_date; nulls last */
export function sortByDueDate<T extends { due_date: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });
}

/**
 * Compute the next due date for a recurring task.
 * anchor='due_date'  → base = current due date (fixed schedule, stays on track)
 * anchor='completion' → base = today (resets from when the task was done)
 */
export function computeNextDueDate(
  currentDueDate: Date | null,
  frequency: RecurFrequency,
  anchor: RecurAnchor,
  /** every N: monthly ×3 = every 3 months. Ignoring it booked filters a month out. */
  interval: number | null = 1,
  completedOn: Date = new Date(),
): Date {
  const n = Math.max(1, interval ?? 1);
  const step = (d: Date) => {
    const next = new Date(d);
    switch (frequency) {
      case 'daily':   next.setDate(next.getDate() + n); break;
      case 'weekly':  next.setDate(next.getDate() + 7 * n); break;
      case 'monthly': next.setMonth(next.getMonth() + n); break;
      case 'yearly':  next.setFullYear(next.getFullYear() + n); break;
    }
    return next;
  };
  let next = step(anchor === 'completion' ? completedOn : (currentDueDate ?? completedOn));
  // A due-date anchor from long ago must not schedule the next one in the past.
  for (let i = 0; next <= completedOn && i < 500; i++) next = step(next);
  return next;
}

/** Convert a DB task row to the UI TaskType shape */
export function dbTaskToTaskType(t: DBTask): TaskType {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? undefined,
    dueDate: t.due_date ? new Date(t.due_date) : null,
    propertyId: t.property_id,
    fileId: t.file_id,
    recurFrequency: t.recur_frequency,
    recurAnchor: t.recur_anchor,
    // Without this an "every 2 years" task, opened and saved, became yearly:
    // the save writes recurInterval ?? 1.
    recurInterval: t.recur_interval ?? 1,
    system: t.system,
    severity: t.severity,
    location: t.location,
    issue: t.issue,
    fixRecommendation: t.fix_recommendation,
    costMin: t.cost_min,
    costMax: t.cost_max,
    timingNote: t.timing_note,
    recurrence: t.recurrence,
    catalogId: t.catalog_id ?? null,
    sourcePage: t.source_page ?? null,
    costConfidence: t.cost_confidence ?? null,
    taskKind: t.task_kind ?? null,
    fromSummary: t.from_summary ?? null,
    sourceQuote: t.source_quote ?? null,
    severityReason: t.severity_reason ?? null,
  };
}

/** Format a Date (or null) to an ISO date string (YYYY-MM-DD) for the DB */
export function toDateString(date: Date | null | undefined): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}
