import { RecurAnchor, RecurFrequency } from '@/types';

export const FREQ_OPTIONS: { label: string; value: RecurFrequency }[] = [
  { label: 'Daily',   value: 'daily'   },
  { label: 'Weekly',  value: 'weekly'  },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Yearly',  value: 'yearly'  },
];

export const ANCHOR_OPTIONS: { label: string; value: RecurAnchor }[] = [
  { label: 'From due date',   value: 'due_date'   },
  { label: 'From completion', value: 'completion' },
];

export const FREQ_LABELS: Record<RecurFrequency, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly',
};

/**
 * Human cadence. recur_frequency alone can only say "monthly"; combined with
 * recur_interval it can say what a homeowner actually needs to hear -
 * "Every 3 months" for a furnace filter, "Every 6 months" for gutters.
 */
export function cadenceLabel(
  frequency: RecurFrequency | null | undefined,
  interval: number | null | undefined,
): string | null {
  if (!frequency) return null;
  const n = interval && interval > 1 ? interval : 1;
  if (n === 1) return FREQ_LABELS[frequency];
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[frequency];
  return `Every ${n} ${unit}s`;
}
