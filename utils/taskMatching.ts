/**
 * Deciding whether two task titles mean the same thing.
 *
 * The Edge Function has its own copy of this logic, because it runs on Deno
 * and cannot import from the app bundle. Keep the two in step: if you add a
 * synonym here, add it there too (supabase/functions/ExtractTasksUsingLLM).
 *
 * Used when building the recurring plan, so BENi doesn't hand a homeowner
 * "Clean gutters and downspouts" when the inspector already told them to
 * "Clean front eavestrough" — same job, two vocabularies.
 */

const SYNONYMS: Record<string, string> = {
  co: 'carbon monoxide',
  co2: 'carbon monoxide',
  ac: 'air conditioning',
  hvac: 'heating ventilation air conditioning',
  gfci: 'ground fault circuit interrupter',
  gfcis: 'ground fault circuit interrupter',
  hrv: 'heat recovery ventilator',
  erv: 'heat recovery ventilator',
  dhw: 'water heater',
  eavestrough: 'gutter',
  eavestroughs: 'gutter',
  downspout: 'gutter',
  downspouts: 'gutter',
  detector: 'alarm',
  detectors: 'alarm',
  alarms: 'alarm',
  outlet: 'receptacle',
  outlets: 'receptacle',
  furnace: 'heating unit',
};

const STOP = new Set([
  'a', 'an', 'and', 'at', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to',
  'with', 'your', 'all', 'both',
]);

/** Strip a trailing plural 's' only where it's safe — never -ss, -us, -is. */
function singularise(word: string): string {
  if (word.length > 3 && word.endsWith('s') && !/(ss|us|is)$/.test(word)) {
    return word.slice(0, -1);
  }
  return word;
}

export function titleTokens(title: string): Set<string> {
  const out = new Set<string>();
  const cleaned = (title || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
  for (const raw of cleaned.split(/\s+/)) {
    if (!raw) continue;
    const expanded = SYNONYMS[raw] ?? raw;
    for (const piece of expanded.split(' ')) {
      const word = singularise(SYNONYMS[piece] ?? piece);
      if (word && !STOP.has(word)) out.add(word);
    }
  }
  return out;
}

/** Overlap of two token sets, 0..1. */
export function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * 0.6 rather than the extractor's 0.7. Standard task titles are written by us
 * and report titles by an inspector, so the wording diverges more than two
 * sentences from the same report do — a looser bar is right here, and the cost
 * of a false match (one missing recurring reminder) is lower than the cost of
 * a duplicate the homeowner has to work out for themselves.
 */
export const SAME_TASK_THRESHOLD = 0.6;

/** Does `title` already exist among `existing`, allowing for wording drift? */
export function alreadyCovered(title: string, existing: Set<string>[]): boolean {
  const tok = titleTokens(title);
  return existing.some((e) => tokenOverlap(tok, e) >= SAME_TASK_THRESHOLD);
}
