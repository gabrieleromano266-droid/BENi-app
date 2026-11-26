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
): Date {
  const base = anchor === 'completion' ? new Date() : (currentDueDate ?? new Date());
  const next = new Date(base);
  switch (frequency) {
    case 'daily':   next.setDate(next.getDate() + 1); break;
    case 'weekly':  next.setDate(next.getDate() + 7); break;
    case 'monthly': next.setMonth(next.getMonth() + 1); break;
    case 'yearly':  next.setFullYear(next.getFullYear() + 1); break;
  }
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
