/**
 * One colour language for how much a task matters (BENI-72).
 *
 * The confirm screen used to colour its dots by how soon the task was due,
 * with no key — the founder could not tell what green or grey meant, at the
 * exact moment he was being asked to approve the list. Now every surface uses
 * the same four colours, and the confirm screen shows the key:
 *
 *   red    Critical — someone could get hurt, water is getting in, or it
 *          gets much worse/expensive if left
 *   amber  Moderate — a repair the report recommends
 *   green  Minor    — small or cosmetic
 *   blue   Recurring upkeep — on a schedule, not a fix
 */
import { Colors } from '@/theme/colors';
import { TaskSeverity } from '@/types';

export type TaskTone = 'critical' | 'moderate' | 'minor' | 'routine' | 'none';

export function taskTone(t: { severity?: TaskSeverity | null; taskKind?: string | null; recurFrequency?: string | null }): TaskTone {
  if (t.severity === 'critical') return 'critical';
  if (t.taskKind === 'routine' || t.recurFrequency) return 'routine';
  if (t.severity === 'moderate') return 'moderate';
  if (t.severity === 'minor') return 'minor';
  return 'none';
}

export function toneColor(tone: TaskTone, colors: Colors): string {
  switch (tone) {
    case 'critical': return colors.danger;
    case 'moderate': return colors.warning;
    case 'minor':    return colors.success;
    case 'routine':  return colors.info;
    default:         return colors.urgencyNone;
  }
}

export const TONE_LABEL: Record<TaskTone, string> = {
  critical: 'Critical',
  moderate: 'Moderate',
  minor: 'Minor',
  routine: 'Recurring',
  none: 'Unrated',
};

/** Critical first, then moderate, minor, recurring — the order to read them in. */
export const TONE_ORDER: Record<TaskTone, number> = { critical: 0, moderate: 1, minor: 2, routine: 3, none: 4 };
