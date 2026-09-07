import { supabase } from '@/services/supabase';
import { DBTask, RecurAnchor, RecurFrequency, TaskRow } from '@/types';
import { sortByDueDate, toDateString } from '@/utils/taskUtils';

// NOTE: this must stay a single string literal. supabase-js infers the row type
// from the select string at compile time, and a concatenated expression makes it
// fall back to GenericStringError (which breaks every call site).
// The trailing fields are inspection-derived: they drive the Home Health Score,
// severity badges, per-system filtering and cost-of-waiting.
const TASK_FIELDS =
  'id, title, description, due_date, user_id, property_id, file_id, recur_frequency, recur_anchor, completed_at, system, severity, location, issue, fix_recommendation, cost_min, cost_max, timing_note, recurrence';

/**
 * Optional inspection-derived detail for a task. Everything is nullable: a
 * manually-created task has none of it, and a partial AI extraction should
 * still save rather than fail.
 */
export type TaskExtras = {
  system?: string | null;
  severity?: string | null;
  location?: string | null;
  issue?: string | null;
  fixRecommendation?: string | null;
  costMin?: number | null;
  costMax?: number | null;
  timingNote?: string | null;
  recurrence?: string | null;
};

/**
 * Map the camelCase extras onto the snake_case DB columns. Always returns the
 * same shape (nulls when absent) so the inferred type stays a plain object and
 * stays spreadable.
 */
function extrasToRow(e?: TaskExtras) {
  return {
    system: e?.system ?? null,
    severity: e?.severity ?? null,
    location: e?.location ?? null,
    issue: e?.issue ?? null,
    fix_recommendation: e?.fixRecommendation ?? null,
    cost_min: e?.costMin ?? null,
    cost_max: e?.costMax ?? null,
    timing_note: e?.timingNote ?? null,
    recurrence: e?.recurrence ?? null,
  };
}

/**
 * Fetch all pending tasks for a user, enriched with property and file names.
 */
export async function fetchAllTasksForUser(userId: string): Promise<TaskRow[]> {
  const { data: propData } = await supabase
    .from('properties')
    .select('id, name')
    .eq('user_id', userId);

  const propMap = Object.fromEntries((propData || []).map((p) => [p.id, p.name]));

  const { data: taskData } = await supabase
    .from('tasks')
    .select(TASK_FIELDS)
    .eq('user_id', userId)
    .is('completed_at', null);

  if (!taskData || taskData.length === 0) return [];

  const fileIds = [...new Set(taskData.map((t) => t.file_id).filter(Boolean))] as string[];
  let fileNameMap: Record<string, string> = {};
  if (fileIds.length > 0) {
    const { data: fileData } = await supabase
      .from('files')
      .select('id, file_name')
      .in('id', fileIds);
    fileNameMap = Object.fromEntries((fileData || []).map((f) => [f.id, f.file_name as string]));
  }

  const tasks: TaskRow[] = taskData.map((t) => ({
    ...t,
    propertyName: t.property_id ? (propMap[t.property_id] || '') : '',
    fileName: t.file_id ? (fileNameMap[t.file_id] || '') : '',
  }));

  return sortByDueDate(tasks);
}

/** Fetch all pending tasks belonging to a property, sorted by due date */
export async function fetchTasksForProperty(propertyId: string): Promise<DBTask[]> {
  const { data } = await supabase
    .from('tasks')
    .select(TASK_FIELDS)
    .eq('property_id', propertyId)
    .is('completed_at', null);
  return sortByDueDate(data || []);
}

/**
 * Create a new task and return the inserted row.
 */
export async function createTask(
  userId: string,
  title: string,
  description: string | null,
  dueDate: Date | null,
  propertyId?: string | null,
  fileId?: string | null,
  recurFrequency?: RecurFrequency | null,
  recurAnchor?: RecurAnchor | null,
  extras?: TaskExtras,
): Promise<DBTask> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: userId,
      title,
      description,
      due_date: toDateString(dueDate),
      property_id: propertyId || null,
      file_id: fileId || null,
      recur_frequency: recurFrequency || null,
      recur_anchor: recurAnchor || null,
      ...extrasToRow(extras),
    })
    .select(TASK_FIELDS)
    .single();

  if (error || !data) throw error || new Error('Failed to create task');
  return data;
}

/** Update a task's fields */
export async function updateTask(
  id: string,
  title: string,
  description: string | null,
  dueDate: Date | null,
  propertyId?: string | null,
  fileId?: string | null,
  recurFrequency?: RecurFrequency | null,
  recurAnchor?: RecurAnchor | null,
): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({
      title,
      description,
      due_date: toDateString(dueDate),
      property_id: propertyId !== undefined ? propertyId : undefined,
      file_id: fileId !== undefined ? fileId : undefined,
      recur_frequency: recurFrequency !== undefined ? recurFrequency : undefined,
      recur_anchor: recurAnchor !== undefined ? recurAnchor : undefined,
    })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Mark a task as complete and optionally create the next occurrence.
 *
 * - If the task already recurs, uses its existing frequency/anchor.
 * - If the task doesn't recur but newFrequency is provided, creates the next
 *   occurrence with that recurrence so future completions keep the pattern.
 * - Returns the newly created task, or null if no next occurrence.
 */
export async function completeTask(
  task: DBTask,
  userId: string,
  nextDueDate: Date | null,
  newFrequency?: RecurFrequency | null,
  newAnchor?: RecurAnchor | null,
): Promise<DBTask | null> {
  await supabase
    .from('tasks')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', task.id);

  const freq = task.recur_frequency ?? newFrequency ?? null;
  const anchor = task.recur_anchor ?? newAnchor ?? null;

  if (!freq || !nextDueDate) return null;

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: userId,
      title: task.title,
      description: task.description,
      due_date: toDateString(nextDueDate),
      property_id: task.property_id,
      file_id: task.file_id,
      recur_frequency: freq,
      recur_anchor: anchor,
    })
    .select(TASK_FIELDS)
    .single();

  if (error || !data) throw error || new Error('Failed to create next occurrence');
  return data;
}

/** Delete one or more tasks by ID */
export async function deleteTasks(ids: string[]): Promise<void> {
  const { error } = await supabase.from('tasks').delete().in('id', ids);
  if (error) throw error;
}
