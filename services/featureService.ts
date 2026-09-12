import { supabase } from '@/services/supabase';
import { DBTask, StandardFeature } from '@/types';
// Single source of truth — a local copy silently drifts when columns are added.
import { TASK_FIELDS } from '@/services/taskService';


export async function fetchStandardFeatures(): Promise<StandardFeature[]> {
  const { data, error } = await supabase
    .from('standard_features')
    .select('id, name, keywords')
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function fetchPropertyFeatureIds(propertyId: string): Promise<number[]> {
  const { data, error } = await supabase
    .from('property_features')
    .select('feature_id')
    .eq('property_id', propertyId);
  if (error) throw error;
  return (data || []).map((r) => r.feature_id);
}

/** Adds a feature to a property and auto-creates standard tasks, skipping duplicates by title. */
export async function addFeatureToProperty(
  propertyId: string,
  featureId: number,
  userId: string,
): Promise<DBTask[]> {
  const { error: insertError } = await supabase
    .from('property_features')
    .insert({ property_id: propertyId, feature_id: featureId });
  if (insertError) throw insertError;

  const { data: stdTasks } = await supabase
    .from('standard_tasks')
    .select('*')
    .eq('feature_id', featureId);

  if (!stdTasks?.length) return [];

  const { data: existingTasks } = await supabase
    .from('tasks')
    .select('title')
    .eq('property_id', propertyId)
    .is('completed_at', null);

  const existingTitles = new Set(
    (existingTasks || []).map((t) => t.title.toLowerCase().trim()),
  );

  const toCreate = stdTasks.filter(
    (st) => !existingTitles.has(st.title.toLowerCase().trim()),
  );

  if (!toCreate.length) return [];

  const { data: created, error } = await supabase
    .from('tasks')
    .insert(
      toCreate.map((st) => ({
        user_id: userId,
        property_id: propertyId,
        title: st.title,
        description: st.description ?? null,
        recur_frequency: st.recur_frequency ?? null,
        recur_anchor: st.recur_anchor ?? null,
        recur_interval: st.recur_interval ?? 1,
        due_date: firstDueDate(
          st.season ?? null,
          st.recur_frequency ?? null,
          st.recur_interval ?? 1,
          st.target_month ?? null,
          st.id ?? 0,
        ),
        system: st.system ?? null,
        cost_min: st.cost_min ?? null,
        cost_max: st.cost_max ?? null,
      })),
    )
    .select(TASK_FIELDS);

  if (error) throw error;
  return created || [];
}

export async function removeFeatureFromProperty(
  propertyId: string,
  featureId: number,
): Promise<void> {
  const { error } = await supabase
    .from('property_features')
    .delete()
    .eq('property_id', propertyId)
    .eq('feature_id', featureId);
  if (error) throw error;
}

/**
 * When should a recurring job first land?
 *
 * Seasonal work is scheduled for its season: if we are already in it, it is due
 * shortly; otherwise it waits for the season to come round. Everything else is
 * on a fixed clock and is simply due one interval from today.
 *
 * Without this, recurring tasks were created with no due date at all — which
 * made them invisible to the notification bell (it is driven entirely by due
 * dates) and left them floating at the bottom of every sorted list.
 */
const SEASON_START: Record<string, { month: number; day: number }> = {
  spring: { month: 2, day: 20 },  // 20 March
  summer: { month: 5, day: 21 },  // 21 June
  fall:   { month: 8, day: 22 },  // 22 September
  winter: { month: 11, day: 21 }, // 21 December
};

const SEASON_ORDER = ['winter', 'spring', 'summer', 'fall'] as const;

/** Which season is a given date in? (northern hemisphere, Calgary) */
function seasonOf(date: Date): string {
  const m = date.getMonth();
  const d = date.getDate();
  if ((m === 2 && d >= 20) || m === 3 || m === 4 || (m === 5 && d < 21)) return 'spring';
  if ((m === 5 && d >= 21) || m === 6 || m === 7 || (m === 8 && d < 22)) return 'summer';
  if ((m === 8 && d >= 22) || m === 9 || m === 10 || (m === 11 && d < 21)) return 'fall';
  return 'winter';
}

function addMonths(date: Date, months: number): Date {
  const out = new Date(date);
  out.setMonth(out.getMonth() + months);
  return out;
}

function firstDueDate(
  season: string | null,
  frequency: string | null,
  interval: number,
  targetMonth?: number | null,
  /** Anything stable per task (its id) — spreads jobs across the month. */
  spread = 0,
): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let due: Date;

  if (targetMonth && targetMonth >= 1 && targetMonth <= 12) {
    // These jobs have real timing: furnace service in September before every
    // company is booked, gutters in October once the leaves are down, sump
    // pumps in March before the melt. Scheduling by month rather than by season
    // is both more accurate and stops ten jobs landing on one day.
    // The day is staggered (1st, 8th, 15th, 22nd) so a month's work arrives as
    // a few separate nudges instead of one wall of notifications.
    const day = 1 + (Math.abs(spread) % 4) * 7;
    due = new Date(today.getFullYear(), targetMonth - 1, day);

    if (due <= today) {
      if (targetMonth - 1 === today.getMonth()) {
        // We are INSIDE the right month and its staggered day has just gone by.
        // Rolling to next year would be badly wrong: on 12 September that would
        // push "drain the outdoor taps" to September 2027, a full Calgary winter
        // after the pipe would have burst. It is due now, so schedule it now.
        due = new Date(today);
        due.setDate(due.getDate() + 7);
      } else {
        due = new Date(today.getFullYear() + 1, targetMonth - 1, day);
      }
    }
  } else if (season && SEASON_START[season]) {
    if (seasonOf(today) === season) {
      // Already in season — give them a fortnight rather than marking it due today.
      due = new Date(today);
      due.setDate(due.getDate() + 14);
    } else {
      const { month, day } = SEASON_START[season];
      due = new Date(today.getFullYear(), month, day);
      if (due <= today) due = new Date(today.getFullYear() + 1, month, day);
    }
  } else if (frequency === 'monthly') {
    due = addMonths(today, interval);
  } else if (frequency === 'weekly') {
    due = new Date(today);
    due.setDate(due.getDate() + 7 * interval);
  } else if (frequency === 'daily') {
    due = new Date(today);
    due.setDate(due.getDate() + interval);
  } else {
    due = addMonths(today, 12 * interval); // yearly, and the safe default
  }

  return due.toISOString().slice(0, 10);
}

/**
 * Create the starter recurring plan for a property in one go.
 *
 * Adds every feature marked `is_common` — the things essentially any detached
 * home has. The conditional ones (air conditioning, a deck, a sump pump, a
 * fireplace) are left for the homeowner to tick, because inventing a chimney
 * sweep for a house with no chimney is worse than asking.
 *
 * Safe to run twice: features already on the property are skipped, and
 * addFeatureToProperty skips task titles that already exist.
 */
export async function setupRecurringPlan(
  propertyId: string,
  userId: string,
): Promise<number> {
  const { data: common, error } = await supabase
    .from('standard_features')
    .select('id')
    .eq('is_common', true);
  if (error) throw error;

  const existing = new Set(await fetchPropertyFeatureIds(propertyId));
  const toAdd = (common ?? []).map((f) => f.id).filter((id) => !existing.has(id));

  let created = 0;
  for (const featureId of toAdd) {
    try {
      const tasks = await addFeatureToProperty(propertyId, featureId, userId);
      created += tasks.length;
    } catch (err) {
      // One bad feature shouldn't abandon the whole plan half-built.
      console.error(`Could not add feature ${featureId} to the plan:`, err);
    }
  }
  return created;
}
