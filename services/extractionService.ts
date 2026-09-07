import { supabase } from '@/services/supabase';
import { HomeSystem, TaskSeverity } from '@/types';

/**
 * What the ExtractTasksUsingLLM Edge Function returns for each finding.
 *
 * Everything except `title` is nullable on purpose — a report that doesn't
 * state a cost or a location should still produce a usable task rather than
 * failing the whole upload.
 */
export type ExtractedTask = {
  title: string;
  dueDate: string | null;
  system: HomeSystem | null;
  severity: TaskSeverity | null;
  location: string | null;
  issue: string | null;
  fixRecommendation: string | null;
  costMin: number | null;
  costMax: number | null;
  timingNote: string | null;
  recurrence: string | null;
  /** matched cost_catalog id, or null when the finding is not in the catalog */
  catalogId: string | null;
};

/**
 * Calls the ExtractTasksUsingLLM Supabase Edge Function.
 *
 * Sends the storage path of an uploaded inspection report and returns the
 * AI-extracted maintenance tasks.
 */
export async function extractTasks(
  description: string,
  filePath: string,
): Promise<ExtractedTask[]> {
  const { data, error } = await supabase.functions.invoke<{
    tasks?: ExtractedTask[];
    error?: string;
  }>('ExtractTasksUsingLLM', {
    body: { description, file_path: filePath },
  });

  // A non-2xx response from the function surfaces here as a FunctionsHttpError,
  // whose useful detail lives in the response body rather than error.message.
  // Without this the user just sees "Edge Function returned a non-2xx status
  // code", which says nothing about what actually went wrong.
  if (error) {
    let detail = '';
    try {
      const ctx = (error as unknown as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        detail = body?.error ?? '';
      }
    } catch {
      // response body wasn't JSON — fall back to the generic message
    }
    console.error('Extract tasks error:', detail || error.message);
    throw new Error(detail || error.message);
  }

  if (data?.error) throw new Error(data.error);

  return data?.tasks ?? [];
}
