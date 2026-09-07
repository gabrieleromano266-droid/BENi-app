import { supabase } from '@/services/supabase';

/**
 * Fetch the signed-in user's first name from their profile row.
 * Returns '' if the profile is missing or the name isn't set, so callers can
 * fall back gracefully (e.g. a nameless greeting).
 */
export async function fetchFirstName(userId: string): Promise<string> {
  const { data } = await supabase
    .from('profiles')
    .select('first_name')
    .eq('id', userId)
    .single();
  return (data?.first_name ?? '').trim();
}
