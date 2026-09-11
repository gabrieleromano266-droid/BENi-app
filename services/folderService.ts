/**
 * Document folders — user-created groupings for the Documents screen.
 *
 * Folders are deliberately flat (no folders inside folders). A homeowner has
 * tens of documents, not thousands; one level keeps "where did I put it?" a
 * question with a short answer, and keeps the UI a list rather than a tree.
 */
import { supabase } from '@/services/supabase';
import { DocumentFolder } from '@/types';

export async function fetchFolders(userId: string): Promise<DocumentFolder[]> {
  const { data, error } = await supabase
    .from('document_folders')
    .select('id, name, created_at')
    .eq('user_id', userId)
    .order('name');
  if (error) throw error;
  return (data ?? []) as DocumentFolder[];
}

export async function createFolder(userId: string, name: string): Promise<DocumentFolder> {
  const clean = name.trim();
  if (!clean) throw new Error('Give the folder a name');

  const { data, error } = await supabase
    .from('document_folders')
    .insert({ user_id: userId, name: clean })
    .select('id, name, created_at')
    .single();

  // 23505 is Postgres' unique-violation code; the unique index is on
  // (user_id, lower(name)), so this means "you already have one of these".
  if (error) {
    if (error.code === '23505') throw new Error(`You already have a folder called "${clean}"`);
    throw error;
  }
  return data as DocumentFolder;
}

export async function renameFolder(folderId: string, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) throw new Error('Give the folder a name');
  const { error } = await supabase
    .from('document_folders')
    .update({ name: clean })
    .eq('id', folderId);
  if (error) {
    if (error.code === '23505') throw new Error(`You already have a folder called "${clean}"`);
    throw error;
  }
}

/**
 * Delete the folder only. Its documents stay — `on delete set null` on
 * files.folder_id returns them to the unfiled list, so tidying up folder names
 * can never cost you a report.
 */
export async function deleteFolder(folderId: string): Promise<void> {
  const { error } = await supabase.from('document_folders').delete().eq('id', folderId);
  if (error) throw error;
}

/** Move a document into a folder, or out of all folders when folderId is null. */
export async function moveFileToFolder(fileId: string, folderId: string | null): Promise<void> {
  const { error } = await supabase.from('files').update({ folder_id: folderId }).eq('id', fileId);
  if (error) throw error;
}
