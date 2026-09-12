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
