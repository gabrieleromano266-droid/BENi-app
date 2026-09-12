/**
 * BENi's feedback loop.
 *
 * Every task a homeowner deletes is them saying "that wasn't worth telling me".
 * Every one they complete is "that was real". Neither costs the user any
 * effort, and together they are the only labelled data BENi will ever get for
 * free — so record them even though nothing reads them yet.
 *
 * Deliberately fire-and-forget: a failure here must never stop someone
 * deleting a task. Losing one row of analytics is nothing; blocking the
 * action the user asked for is not.
 */
import { supabase } from '@/services/supabase';
import { DBTask, TaskRow } from '@/types';

export type TaskEvent = 'deleted' | 'completed' | 'edited' | 'restored';

function daysUntil(due: string | null): number | null {
  if (!due) return null;
  const target = new Date(due + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/**
 * Record what happened to a task.
 *
 * The task's details are SNAPSHOT rather than referenced, because the whole
 * point of a 'deleted' event is that the row is about to vanish. A foreign key
 * to something gone teaches us nothing later.
 */
export async function recordTaskEvent(
  userId: string,
  task: DBTask | TaskRow,
  event: TaskEvent,
  reason?: string,
): Promise<void> {
  try {
    await supabase.from('task_events').insert({
      user_id: userId,
      task_id: task.id,
      file_id: task.file_id ?? null,
      event,
      reason: reason ?? null,
      task_title: task.title,
      task_kind: task.task_kind ?? null,
      severity: task.severity ?? null,
      system: task.system ?? null,
      catalog_id: task.catalog_id ?? null,
      source_page: task.source_page ?? null,
      cost_min: task.cost_min ?? null,
      cost_max: task.cost_max ?? null,
      days_until_due: daysUntil(task.due_date),
    });
  } catch (err) {
    console.error('Could not record task event (continuing):', err);
  }
}

/** Same, for several tasks at once — bulk delete from the dashboard. */
export async function recordTaskEvents(
  userId: string,
  tasks: (DBTask | TaskRow)[],
  event: TaskEvent,
  reason?: string,
): Promise<void> {
  if (tasks.length === 0) return;
  try {
    await supabase.from('task_events').insert(
      tasks.map((task) => ({
        user_id: userId,
        task_id: task.id,
        file_id: task.file_id ?? null,
        event,
        reason: reason ?? null,
        task_title: task.title,
        task_kind: task.task_kind ?? null,
        severity: task.severity ?? null,
        system: task.system ?? null,
        catalog_id: task.catalog_id ?? null,
        source_page: task.source_page ?? null,
        cost_min: task.cost_min ?? null,
        cost_max: task.cost_max ?? null,
        days_until_due: daysUntil(task.due_date),
      })),
    );
  } catch (err) {
    console.error('Could not record task events (continuing):', err);
  }
}
