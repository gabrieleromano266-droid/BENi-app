/**
 * Product-level switches.
 *
 * SINGLE_PROPERTY_MODE — the MVP ships with one home per account.
 *
 * The multi-property machinery underneath is intact and still correct: every
 * file and task carries a property_id, and the queries still scope by it. What
 * this flag turns off is the *user-facing choosing* — the property dropdown,
 * the "All Properties" filter chips, the add-property button — because with one
 * home those controls are pure noise: a filter with a single option, and a
 * toggle that can only ever toggle to itself.
 *
 * Deliberately a flag rather than deleted code. When BENi opens up to multiple
 * homes (landlords, people with a cabin), flipping this back to false restores
 * the full UI without rebuilding it. Deleting it would mean writing it twice.
 */
export const SINGLE_PROPERTY_MODE = true;

/**
 * Largest file a user may upload, in bytes (50 MB).
 *
 * The Supabase bucket enforces this too — that is the real guard, because a
 * determined caller can skip the app entirely. This copy exists so the app can
 * say "that file is 68 MB, the limit is 50 MB" BEFORE spending a minute
 * uploading it, instead of surfacing the storage layer's raw rejection at the
 * end.
 *
 * 50 MB is deliberate, not arbitrary: real inspection reports run 8-30 MB
 * because they are mostly photographs, and the Supabase free tier is 1 GB in
 * total. A larger cap would let a single upload swallow a meaningful slice of
 * the whole project.
 */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Human-readable file size: 1536 -> "1.5 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/**
 * Returns an error message if the file is too big, or null if it is fine.
 * `size` can be undefined — some pickers don't report it, and refusing to
 * upload because we couldn't measure it would be worse than letting the
 * bucket decide.
 */
export function fileTooLargeMessage(size: number | undefined): string | null {
  if (typeof size !== 'number' || Number.isNaN(size)) return null;
  if (size <= MAX_UPLOAD_BYTES) return null;
  return `That file is ${formatBytes(size)}. The largest BENi accepts is ${formatBytes(MAX_UPLOAD_BYTES)} — try compressing it, or upload the pages you need.`;
}

