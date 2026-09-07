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

/** Points subtracted from a system's Home Health Score per open task of this severity */
export const SEVERITY_WEIGHTS: Record<TaskSeverity, number> = {
  critical: 25,
  moderate: 10,
  minor: 3,
};

/** Options for ChipSelector-style pickers */
export const SEVERITY_OPTIONS = SEVERITIES.map((s) => ({ label: s.label, value: s.value as string }));
