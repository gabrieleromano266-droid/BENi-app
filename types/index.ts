// ─── Domain Types ────────────────────────────────────────────────────────────

export type Property = {
  id: string;
  name: string;
};

export type RecurFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type RecurAnchor = 'due_date' | 'completion';

/** The home system a task/finding belongs to, used to group the maintenance plan and compute the Home Health Score */
export type HomeSystem = 'roof_attic' | 'electrical' | 'plumbing' | 'hvac' | 'exterior' | 'interior';

/** How urgently a task affects the home's health score */
export type TaskSeverity = 'critical' | 'moderate' | 'minor';

/** Shape used in UI (camelCase dates, optional fields) */
export type TaskType = {
  id?: string;
  title: string;
  description?: string;
  dueDate?: Date | null;
  propertyId?: string | null;
  fileId?: string | null;
  recurFrequency?: RecurFrequency | null;
  recurAnchor?: RecurAnchor | null;
  system?: HomeSystem | null;
  severity?: TaskSeverity | null;
  location?: string | null;
  issue?: string | null;
  fixRecommendation?: string | null;
  costMin?: number | null;
  costMax?: number | null;
  timingNote?: string | null;
  /** e.g. \"Every 3 months\" — recurring upkeep surfaced by the extractor */
  recurrence?: string | null;
};

/** Raw DB row from the tasks table */
export type DBTask = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  user_id: string;
  property_id: string | null;
  file_id: string | null;
  recur_frequency: RecurFrequency | null;
  recur_anchor: RecurAnchor | null;
  completed_at: string | null;
  system: HomeSystem | null;
  severity: TaskSeverity | null;
  location: string | null;
  issue: string | null;
  fix_recommendation: string | null;
  cost_min: number | null;
  cost_max: number | null;
  timing_note: string | null;
  recurrence: string | null;
};

/** DBTask enriched with the property name (used on dashboard) */
export type TaskRow = DBTask & {
  propertyName: string;
  fileName: string;
};

export type StandardFeature = {
  id: number;
  name: string;
  keywords: string[] | null;
};

/** Raw DB row from the files table */
export type FileRecord = {
  id: string;
  file_name: string;
  file_path: string;
  property_id: string | null;
};
