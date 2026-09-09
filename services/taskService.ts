import { supabase } from '@/services/supabase';
import { DBTask, TaskRow, TaskType } from '@/types';
import { sortByDueDate, toDateString } from '@/utils/taskUtils';

export const TASK_FIELDS = 'id, title, description, due_date, user_id, property_id, file_id, recur_frequency, recur_anchor, completed_at, system, severity, location, issue, fix_recommendation, cost_min, cost_max, timing_note, recurrence, catalog_id, recur_interval, source_page';

/** Fields accepted when creating or updating a task */
export type TaskInput = Omit<TaskType, 'id'>;

function taskInputToRow(input: TaskInput) {
  return {
    title: input.title,
    description: input.description || null,
    due_date: toDateString(input.dueDate ?? null),
    property_id: input.propertyId || null,
    file_id: input.fileId || null,
    recur_frequency: input.recurFrequency || null,
    recur_anchor: input.recurAnchor || null,
    recur_interval: input.recurInterval ?? 1,
    system: input.system || null,
    severity: input.severity || null,
    location: input.location || null,
    issue: input.issue || null,
    fix_recommendation: input.fixRecommendation || null,
    cost_min: input.costMin ?? null,
    cost_max: input.costMax ?? null,
    timing_note: input.timingNote || null,
    recurrence: input.recurrence || null,
    catalog_id: input.catalogId || null,
    source_page: input.sourcePage ?? null,
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
  // The storage path comes along too, so a task can open its own report.
  let filePathMap: Record<string, string> = {};
  if (fileIds.length > 0) {
    const { data: fileData } = await supabase
      .from('files')
      .select('id, file_name, file_path')
      .in('id', fileIds);
    fileNameMap = Object.fromEntries((fileData || []).map((f) => [f.id, f.file_name as string]));
    filePathMap = Object.fromEntries((fileData || []).map((f) => [f.id, f.file_path as string]));
  }

  const tasks: TaskRow[] = taskData.map((t) => ({
    ...t,
    propertyName: t.property_id ? (propMap[t.property_id] || '') : '',
    fileName: t.file_id ? (fileNameMap[t.file_id] || '') : '',
    filePath: t.file_id ? (filePathMap[t.file_id] || '') : '',
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

/** Which nudge window a task currently falls in. */
export type AttentionTier = 'overdue' | 'week' | 'two_weeks' | 'month';

export type AttentionTask = DBTask & { tier: AttentionTier };

export const TIER_LABELS: Record<AttentionTier, string> = {
  overdue:   'Overdue',
  week:      'This week',
  two_weeks: 'Next two weeks',
  month:     'This month',
};

/**
 * Tasks worth nudging about, in tiers rather than all at once.
 *
 * Showing every upcoming task defeats the purpose - with 171 open tasks the bell
 * would just be a wall. Instead a task surfaces as it approaches: roughly a month
 * out, then two weeks, then the final week, then overdue. Anything further away
 * stays out of the way until it earns attention.
 *
 * Note there is no separate "critical regardless of date" rule any more: critical
 * findings are given short due dates (7-30 days) at extraction, so they arrive
 * here on their own merit instead of permanently inflating the count.
 */
export async function fetchAttentionTasks(userId: string): Promise<AttentionTask[]> {
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 30);
  const horizonStr = horizon.toISOString().slice(0, 10);

  const { data } = await supabase
    .from('tasks')
    .select(TASK_FIELDS)
    .eq('user_id', userId)
    .is('completed_at', null)
    .not('due_date', 'is', null)
    .lte('due_date', horizonStr)
    .order('due_date', { ascending: true })
    .limit(60);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (data || []).map((task) => {
    const days = Math.round(
      (new Date(task.due_date + 'T00:00:00').getTime() - today.getTime()) / 86400000,
    );
    const tier: AttentionTier =
      days < 0 ? 'overdue' : days <= 7 ? 'week' : days <= 14 ? 'two_weeks' : 'month';
    return { ...task, tier };
  }) as AttentionTask[];
}

/** Fetch COMPLETED tasks (most recently completed first) for the "Completed" view. */
export async function fetchCompletedTasksForUser(userId: string): Promise<DBTask[]> {
  const { data } = await supabase
    .from('tasks')
    .select(TASK_FIELDS)
    .eq('user_id', userId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false });
  return data || [];
}

/** Count completed tasks for a user, optionally scoped to one property (dashboard "Completed" stat) */
export async function fetchCompletedTaskCount(userId: string, propertyId?: string | null): Promise<number> {
  let query = supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('completed_at', 'is', null);
  if (propertyId) query = query.eq('property_id', propertyId);
  const { count } = await query;
  return count ?? 0;
}

/**
 * Create a new task and return the inserted row.
 */
export async function createTask(userId: string, input: TaskInput): Promise<DBTask> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({ user_id: userId, ...taskInputToRow(input) })
    .select(TASK_FIELDS)
    .single();

  if (error || !data) throw error || new Error('Failed to create task');
  return data;
}

/** Update a task's fields */
export async function updateTask(id: string, input: TaskInput): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update(taskInputToRow(input))
    .eq('id', id);
  if (error) throw error;
}

/**
 * Mark a task as complete and optionally create the next occurrence.
 *
 * - If the task already recurs, uses its existing frequency/anchor.
 * - If the task doesn't recur but newFrequency is provided, creates the next
 *   occurrence with that recurrence so future completions keep the pattern.
 * - The next occurrence carries over the task's system/severity/location/fix/
 *   cost/timing details so a recurring critical roof task stays tagged that way.
 * - Returns the newly created task, or null if no next occurrence.
 */
export async function completeTask(
  task: DBTask,
  userId: string,
  nextDueDate: Date | null,
  newFrequency?: TaskInput['recurFrequency'],
  newAnchor?: TaskInput['recurAnchor'],
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
      system: task.system,
      severity: task.severity,
      location: task.location,
      issue: task.issue,
      fix_recommendation: task.fix_recommendation,
      cost_min: task.cost_min,
      cost_max: task.cost_max,
      timing_note: task.timing_note,
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
