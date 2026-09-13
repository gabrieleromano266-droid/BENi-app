import { supabase } from '@/services/supabase';
import { Property } from '@/types';

/** Fetch all properties for a user, newest first */
export async function fetchProperties(userId: string): Promise<Property[]> {
  const { data } = await supabase
    .from('properties')
    .select('id, name')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return data || [];
}

/** Create a new property for the current authenticated user */
export type NewPropertyDetails = {
  address?: string | null;
  yearBuilt?: number | null;
  lastInspectionDate?: string | null;
};

/**
 * Create a home. Returns its id so onboarding can go straight on to uploading
 * the inspection report against it, instead of dropping the user back on a
 * dashboard and hoping they work out the next step.
 */
export async function createProperty(
  name: string,
  details: NewPropertyDetails = {},
): Promise<string> {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('properties')
    .insert([{
      name: name.trim(),
      user_id: userId,
      address: details.address?.trim() || null,
      year_built: details.yearBuilt ?? null,
      last_inspection_date: details.lastInspectionDate || null,
    }])
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Rename a property */
export async function renameProperty(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('properties')
    .update({ name: name.trim() })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Delete one or more properties by ID.
 * @param cascade - if true, also deletes all files (from storage + DB) and tasks for these properties;
 *                  if false, unlinks tasks and files (sets property_id = null) and keeps them.
 */
export async function deleteProperties(ids: string[], cascade = true): Promise<void> {
  if (cascade) {
    // Fetch files so we can remove them from storage
    const { data: files } = await supabase
      .from('files')
      .select('id, file_path')
      .in('property_id', ids);

    if (files && files.length > 0) {
      const paths = files.map((f) => f.file_path).filter(Boolean);
      if (paths.length > 0) {
        await supabase.storage.from('user_files').remove(paths);
      }
      const fileIds = files.map((f) => f.id);
      await supabase.from('tasks').delete().in('file_id', fileIds);
      await supabase.from('files').delete().in('id', fileIds);
    }

    // Delete tasks directly linked to property (not via file)
    await supabase.from('tasks').delete().in('property_id', ids);
  } else {
    // Unlink tasks and files — keep them, just remove the property reference
    await supabase.from('tasks').update({ property_id: null, file_id: null }).in('property_id', ids);
    await supabase.from('files').update({ property_id: null }).in('property_id', ids);
  }

  const { error } = await supabase.from('properties').delete().in('id', ids);
  if (error) throw error;
}
