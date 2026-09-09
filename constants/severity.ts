import { TaskSeverity } from '@/types';

export const SEVERITIES: { value: TaskSeverity; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'minor', label: 'Minor' },
];

export const SEVERITY_LABELS: Record<TaskSeverity, string> = {
  critical: 'Critical',
  moderate: 'Moderate',
  minor: 'Minor',
};

/**
 * Home Health Score weighting.
 *
 * The original model subtracted a flat amount per task, which measured how
 * THOROUGH the extraction was rather than how healthy the home is: a system with
 * zero safety issues but 5 moderate + 13 minor items (nail pops, caulking,
 * paint) scored 0/100. As extraction improved from 13 to 69 findings, every
 * home's score halved - exactly backwards.
 *
 * So routine work now has diminishing returns while safety does not:
 *
 *     deduction = CRITICAL x count  +  MODERATE x sqrt(count)  +  MINOR x sqrt(count)
 *
 * The first moderate item in a system is the real signal ("plumbing needs
 * attention"); the tenth tells you little new, so it costs ~1.5 points instead
 * of 10. Criticals stay LINEAR on purpose - under a square root, five gas or
 * electrical hazards in one system would still score 44/100.
 */
export const CRITICAL_WEIGHT = 25;   // per item, linear - danger does not damp
export const MODERATE_WEIGHT = 12;   // x sqrt(count)
export const MINOR_WEIGHT = 4;       // x sqrt(count)

/** Never show 0: it reads as hopeless and stops being motivating. */
export const SCORE_FLOOR = 10;

/** Legacy flat weights, kept only for ordering/---comparison helpers. */
export const SEVERITY_WEIGHTS: Record<TaskSeverity, number> = {
  critical: 25,
  moderate: 10,
  minor: 3,
};

/** Options for ChipSelector-style pickers */
export const SEVERITY_OPTIONS = SEVERITIES.map((s) => ({ label: s.label, value: s.value as string }));
