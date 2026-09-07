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
