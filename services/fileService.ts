import { supabase } from '@/services/supabase';
import { FileRecord } from '@/types';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Linking, Platform } from 'react-native';

/** Fetch all files for a property */
export async function fetchFilesForProperty(propertyId: string): Promise<FileRecord[]> {
  const { data } = await supabase
    .from('files')
    .select('id, file_name, file_path, property_id, folder_id')
    .eq('property_id', propertyId);
  return data || [];
}

/**
 * Returns a deduplicated display name for a file within a user's files.
 * If "report.pdf" exists, returns "report (1).pdf", then "report (2).pdf", etc.
 */
async function resolveUniqueFileName(userId: string, fileName: string): Promise<string> {
  const { data: existing } = await supabase
    .from('files')
    .select('file_name')
    .eq('user_id', userId);

  const names = new Set((existing || []).map((f) => f.file_name));
  if (!names.has(fileName)) return fileName;

  const dot = fileName.lastIndexOf('.');
  const base = dot !== -1 ? fileName.slice(0, dot) : fileName;
  const ext = dot !== -1 ? fileName.slice(dot) : '';

  let i = 1;
  while (names.has(`${base} (${i})${ext}`)) i++;
  return `${base} (${i})${ext}`;
}

/**
 * Upload a document file to storage and insert a record in the files table.
 * Storage path: {userId}/{propertyId}/{timestamp}-{fileName}
 * Returns the new file's DB id, storage path, and resolved display name.
 */
export async function uploadPropertyFile(
  userId: string,
  propertyId: string,
  fileUri: string,
  fileName: string,
): Promise<{ id: string; filePath: string; displayName: string }> {
  const displayName = await resolveUniqueFileName(userId, fileName);
  const response = await fetch(fileUri);
  const blob = await response.blob();
  const filePath = `${userId}/${propertyId}/${Date.now()}-${displayName}`;

  const { error: uploadError } = await supabase.storage
    .from('user_files')
    .upload(filePath, blob);
  if (uploadError) throw uploadError;

  const { data, error: dbError } = await supabase
    .from('files')
    .insert({ user_id: userId, property_id: propertyId, file_path: filePath, file_name: displayName })
    .select('id')
    .single();
  if (dbError) throw dbError;

  return { id: data.id, filePath, displayName };
}

/**
 * Attach proof-of-work to a completed task: a receipt, invoice, before/after
 * photo, or a screenshot of a contractor conversation.
 *
 * Stored in the same private bucket under the user's own folder, so the existing
 * per-user storage policy already protects it. Note this costs no AI at all -
 * it is a plain file upload. Receipts gathered here are also the ground truth
 * we can eventually use to tighten the cost catalog's estimates.
 */
export async function uploadTaskDocument(
  userId: string,
  taskId: string,
  propertyId: string | null,
  fileUri: string,
  fileName: string,
): Promise<{ id: string; filePath: string; displayName: string }> {
  const displayName = await resolveUniqueFileName(userId, fileName);
  const response = await fetch(fileUri);
  const blob = await response.blob();
  const filePath = `${userId}/tasks/${taskId}/${Date.now()}-${displayName}`;

  const { error: uploadError } = await supabase.storage
    .from('user_files')
    .upload(filePath, blob);
  if (uploadError) throw uploadError;

  const { data, error: dbError } = await supabase
    .from('files')
    .insert({
      user_id: userId,
      task_id: taskId,
      property_id: propertyId,
      file_path: filePath,
      file_name: displayName,
      kind: 'completion_proof',
    })
    .select('id')
    .single();
  if (dbError) throw dbError;

  return { id: data.id, filePath, displayName };
}

/**
 * Delete files from storage and their DB records.
 * @param deleteLinkedTasks - if true, also deletes all tasks linked to these files;
 *                            if false, unlinks tasks (sets file_id = null).
 */
export async function deleteFiles(files: FileRecord[], deleteLinkedTasks = true): Promise<void> {
  const paths = files.map((f) => f.file_path).filter(Boolean);
  if (paths.length > 0) {
    await supabase.storage.from('user_files').remove(paths);
  }
  const ids = files.map((f) => f.id);
  if (deleteLinkedTasks) {
    await supabase.from('tasks').delete().in('file_id', ids);
  } else {
    await supabase.from('tasks').update({ file_id: null }).in('file_id', ids);
  }
  await supabase.from('files').delete().in('id', ids);
}

/**
 * Open a stored report for READING, jumped to a specific page.
 *
 * Deliberately different from downloadFile(): that one saves a copy, this one
 * views it. We hand out a short-lived signed URL rather than downloading the
 * bytes, because the "#page=N" fragment is understood by the browser's built-in
 * PDF viewer — that is what makes "view in report" land on the right page
 * instead of the cover.
 *
 * The bucket is private, so the signed URL is the only way a viewer can read
 * it, and it expires in ten minutes.
 */
export async function openFileAtPage(
  filePath: string,
  page?: number | null,
): Promise<void> {
  const { data, error } = await supabase.storage
    .from('user_files')
    .createSignedUrl(filePath, 600);
  if (error || !data?.signedUrl) throw error || new Error('Could not open this report');

  const url = page && page > 0 ? `${data.signedUrl}#page=${page}` : data.signedUrl;

  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  await Linking.openURL(url);
}

/** Download a file — opens a save dialog on web, share sheet on native */
export async function downloadFile(filePath: string, fileName: string): Promise<void> {
  const { data, error } = await supabase.storage.from('user_files').download(filePath);
  if (error || !data) throw error || new Error('Download failed');

  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(data);
  });

  const localUri = (FileSystem.cacheDirectory ?? '') + fileName;
  await FileSystem.writeAsStringAsync(localUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(localUri);
  }
}
