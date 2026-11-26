import { supabase } from '@/services/supabase';
import { HomeSystem, TaskKind, TaskSeverity } from '@/types';

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
  /** 1-based page of the report this finding was found on, or null */
  sourcePage: number | null;
  /** Trust level of the cost estimate: 'High' | 'Medium' | 'Low', or null */
  costConfidence: string | null;
  /** 'action' | 'routine' | 'note' — what kind of statement this was */
  taskKind: TaskKind | null;
  /** Came from the inspector's summary section */
  fromSummary: boolean;
  /** The inspector's exact words, verified against the PDF (null if not verifiable) */
  quote?: string | null;
  /** Plain-English reason for the severity */
  severityReason?: string | null;
  /** Real schedule, parsed server-side from `recurrence` */
  recurFrequency?: 'daily' | 'weekly' | 'monthly' | 'yearly' | null;
  recurInterval?: number | null;
  /** Days after the inspection the report allows (for re-dating on the confirm screen) */
  dueWindowDays?: number | null;
  /** The report's own deadline had passed by the time it was uploaded */
  carriedOver?: boolean;
};

/** What one extraction returns: the findings, plus the date the home was inspected. */
export type ExtractionResult = {
  tasks: ExtractedTask[];
  /** YYYY-MM-DD read from the report, or null if it doesn't state one clearly */
  inspectionDate: string | null;
  inspectionDatePage: number | null;
};

/**
 * Calls the ExtractTasksUsingLLM Supabase Edge Function.
 *
 * Sends the storage path of an uploaded inspection report and returns the
 * AI-extracted maintenance tasks, plus the inspection date it found.
 */
export async function extractTasks(
  description: string,
  filePath: string,
): Promise<ExtractionResult> {
  const { data, error } = await supabase.functions.invoke<{
    tasks?: ExtractedTask[];
    inspectionDate?: string | null;
    inspectionDatePage?: number | null;
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

  return {
    tasks: data?.tasks ?? [],
    inspectionDate: data?.inspectionDate ?? null,
    inspectionDatePage: data?.inspectionDatePage ?? null,
  };
}
