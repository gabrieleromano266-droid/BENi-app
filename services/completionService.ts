/**
 * What actually happened when a task was done (BENI-78). Every real price a
 * homeowner enters sits next to BENi's own estimate and catalog match, which
 * is what lets the cost catalog learn real Calgary prices over time.
 */
import { supabase } from '@/services/supabase';
import { DBTask } from '@/types';

export type CompletionAction = 'repaired' | 'replaced' | 'serviced' | 'inspected' | 'other';
export type DoneBy = 'self' | 'pro';

export const ACTION_LABEL: Record<CompletionAction, string> = {
  repaired: 'Repaired',
  replaced: 'Replaced',
  serviced: 'Serviced / cleaned',
  inspected: 'Checked it',
  other: 'Something else',
};

export const DONE_BY_LABEL: Record<DoneBy, string> = {
  self: 'I did it myself',
  pro: 'Hired a pro',
};

export type CompletionDetails = {
  completedOn: Date;
  action: CompletionAction | null;
  doneBy: DoneBy | null;
  proName: string;
  cost: number | null;
  notes: string;
};

export type Completion = {
  completed_on: string;
  action: CompletionAction | null;
  done_by: DoneBy | null;
  pro_name: string | null;
  cost_actual: number | null;
  notes: string | null;
};

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "$1,250" / "1250.50" / "about 400" → a number, or null when there isn't one. */
export function parseCost(text: string): number | null {
  const n = Number(text.replace(/[^0-9.]/g, ''));
  return text.trim() && Number.isFinite(n) && n >= 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : null;
}

/** Best-effort: the task is already complete; a failure here must not undo that. */
export async function saveCompletion(task: DBTask, userId: string, d: CompletionDetails): Promise<boolean> {
  const { error } = await supabase.from('task_completions').upsert(
    {
      task_id: task.id,
      user_id: userId,
      property_id: task.property_id,
      completed_on: isoDate(d.completedOn),
      action: d.action,
      done_by: d.doneBy,
      pro_name: d.doneBy === 'pro' && d.proName.trim() ? d.proName.trim().slice(0, 120) : null,
      cost_actual: d.cost,
      notes: d.notes.trim() ? d.notes.trim().slice(0, 2000) : null,
      task_title: task.title,
      system: task.system,
      severity: task.severity,
      catalog_id: task.catalog_id,
      estimate_min: task.cost_min,
      estimate_max: task.cost_max,
    },
    { onConflict: 'task_id' },
  );
  if (error) console.error('Could not save the completion summary:', error.message);
  return !error;
}

export async function fetchCompletion(taskId: string): Promise<Completion | null> {
  const { data, error } = await supabase
    .from('task_completions')
    .select('completed_on, action, done_by, pro_name, cost_actual, notes')
    .eq('task_id', taskId)
    .maybeSingle();
  if (error) throw error;
  return (data as Completion | null) ?? null;
}
