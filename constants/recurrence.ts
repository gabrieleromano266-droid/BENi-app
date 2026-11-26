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

/**
 * The schedules a homeowner actually needs, as one list (BENI-71).
 *
 * The old picker offered Daily / Weekly / Monthly / Yearly — no way to say
 * "every 2 years" for a roof the inspector says to have looked at every two
 * years, or "every 5 years" for washing-machine hoses. Frequency and interval
 * live in separate columns; these presets set both at once.
 */
export const RECUR_PRESETS: { label: string; value: string }[] = [
  { label: 'Every month',    value: 'monthly:1' },
  { label: 'Every 3 months', value: 'monthly:3' },
  { label: 'Every 6 months', value: 'monthly:6' },
  { label: 'Every year',     value: 'yearly:1' },
  { label: 'Every 2 years',  value: 'yearly:2' },
  { label: 'Every 5 years',  value: 'yearly:5' },
  { label: 'Every week',     value: 'weekly:1' },
];

export function presetKey(frequency: RecurFrequency | null | undefined, interval: number | null | undefined): string | null {
  if (!frequency) return null;
  return `${frequency}:${interval && interval > 0 ? interval : 1}`;
}

export function fromPresetKey(key: string | null): { frequency: RecurFrequency; interval: number } | null {
  if (!key) return null;
  const [f, n] = key.split(':');
  return { frequency: f as RecurFrequency, interval: Math.max(1, parseInt(n, 10) || 1) };
}

/** The presets, plus the task's own schedule if it is something unusual
    ("every 3 years") — so opening a task never silently changes it. */
export function presetOptions(frequency: RecurFrequency | null | undefined, interval: number | null | undefined) {
  const key = presetKey(frequency, interval);
  if (!key || RECUR_PRESETS.some((p) => p.value === key)) return RECUR_PRESETS;
  return [...RECUR_PRESETS, { label: cadenceLabel(frequency, interval) ?? key, value: key }];
}
