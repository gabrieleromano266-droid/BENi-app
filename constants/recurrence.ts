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

/**
 * Turn the inspector's words into a schedule.
 *
 * Extraction hands us a phrase — "Every 3 months", "annually", "seasonally",
 * "twice a year" — and until BENI-53 that phrase was stored as text and never
 * became a real cadence, so the task could not count as recurring and could
 * never come due. This is the one place that mapping lives on the client.
 *
 * Returns null for phrasing it cannot read ("as needed"); the caller decides
 * the default. For a routine finding that default is yearly, because "check
 * it once a year" is what an inspector means by "monitor".
 */
export function parseRecurrence(
  text: string | null | undefined,
): { frequency: RecurFrequency; interval: number } | null {
  if (!text) return null;
  const t = text.toLowerCase();
  const n = parseInt((t.match(/\d+/) ?? ['1'])[0], 10);
  const interval = Number.isFinite(n) && n > 0 ? n : 1;
  if (/\bdai|\bday/.test(t)) return { frequency: 'daily', interval };
  if (/week/.test(t)) return { frequency: 'weekly', interval };
  if (/month/.test(t)) return { frequency: 'monthly', interval };
  if (/year|annual|season/.test(t)) return { frequency: 'yearly', interval };
  return null;
}

/** First time a schedule comes round, counted from today. */
export function nextDueFromCadence(
  frequency: RecurFrequency,
  interval: number,
  from: Date = new Date(),
): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const n = interval > 0 ? interval : 1;
  if (frequency === 'daily') d.setDate(d.getDate() + n);
  else if (frequency === 'weekly') d.setDate(d.getDate() + 7 * n);
  else if (frequency === 'monthly') d.setMonth(d.getMonth() + n);
  else d.setFullYear(d.getFullYear() + n);
  return d;
}
