/**
 * Completing a task, in one place for every screen: close it (only if still
 * open), save what was done and what it cost, attach the receipts, and book
 * the next occurrence. Three pages each used to do this their own way, and two
 * of them quietly dropped the receipts.
 */
import type { CompleteResult } from '@/components/CompleteTaskModal';
import { saveCompletion } from '@/services/completionService';
import { attachRecords } from '@/services/fileService';
import { completeTask } from '@/services/taskService';
import { DBTask } from '@/types';

export type FinishOutcome = {
  next: DBTask | null;
  completedAt: string;
  failedFiles: number;
  summarySaved: boolean;
};

export async function finishTask(task: DBTask, userId: string, result: CompleteResult): Promise<FinishOutcome | null> {
  if (task.completed_at) return null;
  const { completedOn } = result.details;
  const next = await completeTask(
    task, userId, result.nextDueDate, result.newFrequency, result.newAnchor, completedOn,
  );
  const summarySaved = await saveCompletion(task, userId, result.details);
  const failedFiles = await attachRecords(userId, task.id, task.property_id, result.proofs);
  const today = new Date();
  const completedAt = completedOn.toDateString() === today.toDateString()
    ? today.toISOString()
    : new Date(completedOn.getFullYear(), completedOn.getMonth(), completedOn.getDate(), 12).toISOString();
  return { next, completedAt, failedFiles, summarySaved };
}

export function finishedMessage(o: FinishOutcome): string {
  if (o.failedFiles) return `Done — but ${o.failedFiles} file${o.failedFiles === 1 ? '' : 's'} didn’t save`;
  if (!o.summarySaved) return 'Done — but the details didn’t save';
  return o.next ? 'Done — next one scheduled' : 'Nice work — it’s on your home’s record';
}
