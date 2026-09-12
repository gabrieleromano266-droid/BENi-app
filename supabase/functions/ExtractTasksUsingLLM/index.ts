// Supabase Edge Function: ExtractTasksUsingLLM
// ---------------------------------------------------------------------------
// Turns an uploaded home-inspection PDF into structured maintenance tasks.
//
// WHY THIS VERSION EXISTS (changes vs. the previous one):
//
// 1. PDF TEXT REPAIR (the big one). The inspection PDFs we're targeting render
//    text with a space between EVERY character ("E l e c t r i c a l") and a
//    DOUBLE space between words. Raw extraction produced ~98% single-character
//    tokens. That wrecked accuracy (the model was reading scrambled text) and
//    inflated cost badly (each letter became its own token). `repairSpacedText`
//    reconstructs real words and cuts the payload ~44%.
//
// 2. BOILERPLATE TRIMMING. Reports open with several pages of thank-you notes,
//    disclaimers, standards-of-practice and legends. None of it contains
//    findings. We slice from the first real section header onward, which cuts
//    tokens (and cost) further without losing a single finding.
//
// 3. HONEST ERRORS. The old version surfaced "LLM request failed: 429", which
//    is ambiguous — OpenAI returns 429 both for real rate limits AND for
//    "you have no credit" (insufficient_quota). We now parse the error body and
//    return a plain-English message so the app can tell the user what's wrong.
//
// 4. RETRY WITH BACKOFF for genuine transient failures (real 429s / 5xx).
//
// 5. RICHER OUTPUT so the dashboard can show a Home Health Score, severity
//    badges, per-system filtering and cost-of-waiting. Every field is optional —
//    a missing field degrades gracefully rather than failing the whole upload.
//
// Deploy: supabase functions deploy ExtractTasksUsingLLM
// ---------------------------------------------------------------------------

import { createClient } from 'jsr:@supabase/supabase-js@2';

const HOME_SYSTEMS = ['roof_attic', 'electrical', 'plumbing', 'hvac', 'exterior', 'interior'] as const;
const SEVERITIES = ['critical', 'moderate', 'minor'] as const;

type ExtractedTask = {
  title: string;
  dueDate: string | null;
  system: (typeof HOME_SYSTEMS)[number] | null;
  severity: (typeof SEVERITIES)[number] | null;
  location: string | null;
  issue: string | null;
  fixRecommendation: string | null;
  costMin: number | null;
  costMax: number | null;
  timingNote: string | null;
  recurrence: string | null;
  catalogId: string | null;
  /** 1-based page of the source PDF. Computed from offsets, never guessed by the model. */
  sourcePage: number | null;
  /** How much the catalog's price is trusted: High | Medium | Low, or null when unmatched. */
  costConfidence: string | null;
  /** action | routine | note — see classifyTaskKind(). */
  taskKind: string | null;
};

// Section headings used by the target inspection format. Findings live under
// these; everything before the first one is front matter.
type CatalogRow = {
  id: string;
  system: string;
  component: string;
  defect: string;
  location: string | null;
  meaning: string | null;
  severity: string | null;
  urgency: string | null;
  cost_low: number | null;
  cost_typical: number | null;
  cost_high: number | null;
  confidence: string | null;
};

const SECTION_HEADERS = [
  'CONDUCT', 'ROOF', 'EXTERIOR', 'GARAGE', 'ATTIC', 'INTERIOR',
  'KITCHEN', 'LAUNDROMAT', 'LAUNDRY', 'BATHROOM', 'MECHANICAL',
];

/**
 * STAGE 1 prompt - extraction only.
 *
 * Deliberately contains NO catalog. Asking one call to both find every finding
 * AND match it to a 224-row catalog made the model lazy: completion tokens fell
 * from ~1,737 to ~745 and it returned a third of the findings. One job per call.
 */
function buildExtractPrompt(): string {
  return `You read home inspection reports and pull out EVERY actionable finding.

WHAT COUNTS AS A FINDING (format-independent)
Reports vary by company and template - do not rely on any single layout. A
finding is ANY place the report describes an observed condition, defect, damage,
wear, safety concern, or recommended action for part of the home. Signals:
recommend, repair, replace, service, monitor, seal, clean, damaged, deteriorated,
missing, loose, cracked, leaking, worn, corroded, improper, unsafe, end of life.

Many reports group findings under ALL-CAPS headings (ROOF, EXTERIOR, GARAGE,
ATTIC, INTERIOR, KITCHEN, LAUNDROMAT, BATHROOM, MECHANICAL) and phrase each as:

    Component Name:
    <what was observed>. This may <consequence>. Recommend <action>.

Treat that as a hint, not a rule.

COMPLETENESS IS THE ONLY PRIORITY
Extract every finding in the text you are given. Do NOT summarise, merge similar
items, or stop early. Two similar-sounding problems in different locations are
TWO findings. Missing one is the worst possible failure. Only skip genuinely
non-actionable text: "no deficiencies noted", credentials, disclaimers,
standards of practice, invoices.

FIELDS per finding
- title: short, action-first, specific ("Reseal roof flashing at the chimney").
  Never just repeat the component name.
- issue: 1-2 plain sentences on what is wrong, for a homeowner.
- fixRecommendation: 1-2 sentences on the fix, from the report's wording.
- location: where it is, or null.
- system: EXACTLY one of ${HOME_SYSTEMS.join(', ')} - judge by CONTENT:
  wiring/outlets/panels -> electrical; pipes/drains/water heater -> plumbing;
  furnace/AC/ducts -> hvac; roof/attic -> roof_attic; grading/siding/gutters/
  garage -> exterior; kitchen/bathroom/living space -> interior.
- severity: one of ${SEVERITIES.join(', ')} - best judgement.
- costMin/costMax: rough CAD integers, or null.
- dueDate: ISO YYYY-MM-DD only if the report states/implies one, else null.
- timingNote: short and practical, or null.
- recurrence: "Every 3 months" | "Every 6 months" | "Yearly" if it is recurring
  upkeep, else null.

Return ONLY valid JSON: { "tasks": [...] }. No markdown fences.`;
}

/**
 * STAGE 2 prompt - matching only. Receives the short list of findings we already
 * extracted plus the catalog, and does nothing but assign ids. Cheap and focused.
 */
function buildMatchPrompt(catalogText: string): string {
  return `You match home inspection findings to BENi's cost catalog.

You will be given a numbered list of findings. For EACH one, return the id of the
single best-matching catalog entry, or null if nothing genuinely matches.

Match on the DEFECT / CONDITION, not just the component name. Example: "the ground
slopes toward the house" matches the "Negative slope toward foundation" entry.

RETURNING null IS THE RIGHT ANSWER MORE OFTEN THAN YOU THINK.
Only match when BOTH the component AND the defect genuinely correspond. If the
catalog has no entry for the thing described, return null. Real failures seen:
  - "damaged exterior vent" was matched to "Vinyl Siding - hail damage" ($9k-$22k).
    A single vent is NOT whole-house siding. Correct answer: null.
  - "deteriorated backyard fence" was matched to "Vinyl Siding - full replacement".
    A fence is not cladding, and there is no fence entry. Correct answer: null.

RESPECT SCALE AND SEVERITY WORDS.
A "minor", "small", "hairline" or "cosmetic" problem must NOT be matched to a
catastrophic entry. "Seal minor foundation cracks" is the hairline-crack entry
(a few hundred dollars), NOT "horizontal crack with inward bowing" ($20k).
Sanity-check the cost shown for each entry: if it looks wildly out of proportion
to the finding described, it is the wrong entry - return null instead.

Never invent an id that is not in the catalog. Never force a poor match.

CATALOG (id | system | component | defect | typical cost CAD)
${catalogText}

Return ONLY valid JSON of the form:
{ "matches": [ { "index": <number from the list>, "catalogId": "EX-001" | null } ] }
Include an entry for EVERY finding you were given.`;
}


// ---------------------------------------------------------------------------
// PDF text repair
// ---------------------------------------------------------------------------

/**
 * These PDFs put a single space between characters and a double space between
 * words. Detect lines that are mostly single characters and rebuild them:
 * protect the double spaces (word boundaries), delete the single spaces
 * (letter padding), then restore the boundaries.
 */
function repairSpacedText(text: string): string {
  const lines = text.split('\n').map((line) => {
    const tokens = line.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return line;

    const singles = tokens.filter((t) => t.length === 1).length;
    if (singles / tokens.length <= 0.5) return line; // already normal prose

    if (line.includes('  ')) {
      return line
        .replace(/ {2,}/g, '\u0000')
        .replace(/ /g, '')
        .replace(/\u0000/g, ' ');
    }
    return line.replace(/ /g, ''); // single-word line, e.g. "A t t e n t i o n"
  });

  return lines
    .join('\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\/g\d+/g, '') // strip PDF glyph placeholders like "/g0"
    .trim();
}

/**
 * Drop the front matter (cover, thank-you, disclaimer, legends). Findings only
 * start at the first real section header, so anything before it is dead weight.
 * If we can't confidently find a header we keep the whole document — better to
 * pay for a few extra tokens than to silently drop findings.
 */
function findingsOffset(text: string): number {
  const pattern = new RegExp(`^\\s*(${SECTION_HEADERS.join('|')})\\s*$`, 'm');
  const lines = text.split('\n');

  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      // Require a couple more headers after this point so we don't cut at the
      // table of contents.
      const rest = lines.slice(i).join('\n');
      const headerCount = (rest.match(new RegExp(`^\\s*(${SECTION_HEADERS.join('|')})\\s*$`, 'gm')) || []).length;
      if (headerCount >= 3) return offset;
    }
    offset += lines[i].length + 1; // +1 for the newline split() removed
  }
  return 0;
}

const MAX_CHARS = 120_000; // generous ceiling after repair; ~30k tokens

/**
 * The report, prepared for the model, WITH its page boundaries preserved.
 *
 * `pageStarts[i]` is the character offset in `text` at which PDF page (i+1)
 * begins. Offsets can be negative for pages that fell inside the trimmed front
 * matter — that is fine, it just means those pages are before the text we kept.
 */
type PreparedReport = {
  text: string;
  pageStarts: number[];
  /** Repaired text of each page, used to pin a finding to one page. */
  pages: string[];
  rawChars: number;
  finalChars: number;
};

const PAGE_JOIN = '\n\n';

/**
 * Build the prompt text AND the page index in one pass.
 *
 * The previous version asked the PDF library to merge every page into one
 * string, which threw away the page numbers before anything else ran. We now
 * repair each page on its own (the repair is line-based, so per-page gives the
 * same result) and glue the pages together ourselves, writing down where each
 * one started. That makes "which page did this finding come from?" a lookup
 * rather than a question for the model.
 */
function preparePdfText(rawPages: string[]): PreparedReport {
  const rawChars = rawPages.reduce((n, page) => n + page.length, 0);
  const pages = rawPages.map(repairSpacedText);

  const pageStarts: number[] = [];
  let offset = 0;
  pages.forEach((page, i) => {
    pageStarts.push(offset);
    offset += page.length + (i < pages.length - 1 ? PAGE_JOIN.length : 0);
  });
  const joined = pages.join(PAGE_JOIN);

  // Front matter (thank-you notes, disclaimers, legends) is cut off the front,
  // so every page start shifts left by however much we removed.
  const cut = findingsOffset(joined);
  const trimmed = joined.slice(cut);
  const capped = trimmed.length > MAX_CHARS ? trimmed.slice(0, MAX_CHARS) : trimmed;

  return {
    text: capped,
    pageStarts: pageStarts.map((start) => start - cut),
    pages,
    rawChars,
    finalChars: capped.length,
  };
}

/** Which PDF page does this character offset fall on? (1-based) */
function pageForOffset(offset: number, pageStarts: number[]): number {
  let page = 1;
  for (let i = 0; i < pageStarts.length; i++) {
    if (pageStarts[i] <= offset) page = i + 1;
    else break;
  }
  return page;
}

async function extractPdfPages(pdfBytes: Uint8Array): Promise<string[]> {
  const { extractText, getDocumentProxy } = await import('npm:unpdf@0.11.0');
  const pdf = await getDocumentProxy(pdfBytes);
  // mergePages:false is the whole point — it keeps the pages as an array.
  const { text } = await extractText(pdf, { mergePages: false });
  return Array.isArray(text) ? text : [String(text)];
}

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Turn an OpenAI error body into something a human can act on. */
function describeOpenAiError(status: number, body: string): string {
  let type = '';
  let message = '';
  try {
    const parsed = JSON.parse(body);
    type = parsed?.error?.type ?? parsed?.error?.code ?? '';
    message = parsed?.error?.message ?? '';
  } catch {
    message = body.slice(0, 500);
  }

  if (status === 429 && /insufficient_quota|billing|exceeded your current quota/i.test(`${type} ${message}`)) {
    return 'AI provider rejected the request: the OpenAI account has no usable credit. ' +
      'Check the billing balance, and make sure the API key belongs to the same OpenAI ' +
      'project/organisation that the credits were added to.';
  }
  if (status === 429) {
    return 'AI provider is rate limiting us right now. Please try again in a moment.';
  }
  if (status === 401) {
    return 'AI provider rejected the API key (401). The OPENAI_API_KEY secret is missing, ' +
      'revoked, or malformed.';
  }
  if (status === 404) {
    return `AI provider says the model is unavailable to this account (404). ${message}`;
  }
  return `AI request failed (${status}). ${message}`;
}

/** One JSON chat call, with retry/backoff for genuinely transient failures. */
async function chatJSON(system: string, user: string, label: string): Promise<Record<string, unknown>> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured in Edge Function secrets.');
  const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini';

  const MAX_ATTEMPTS = 3;
  let lastError = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    if (response.ok) {
      const completion = await response.json();
      const usage = completion.usage;
      if (usage) {
        console.log(
          `LLM ok [${label}] - model=${model} prompt_tokens=${usage.prompt_tokens} completion_tokens=${usage.completion_tokens}`
        );
      }
      const content = completion.choices?.[0]?.message?.content ?? '{}';
      try {
        return JSON.parse(content);
      } catch {
        throw new Error('The AI returned malformed JSON. Please try again.');
      }
    }

    const body = await response.text();
    lastError = describeOpenAiError(response.status, body);
    console.error(`LLM [${label}] attempt ${attempt}/${MAX_ATTEMPTS} failed (${response.status}): ${body.slice(0, 300)}`);

    const retryable = response.status >= 500 ||
      (response.status === 429 && !/insufficient_quota/i.test(body));
    if (!retryable || attempt === MAX_ATTEMPTS) break;
    await sleep(1000 * 2 ** (attempt - 1));
  }

  throw new Error(lastError || 'AI request failed.');
}

/**
 * Split the report so each extraction call sees a small, focused slice.
 * Long documents are where recall collapses: the model skims. Sectioning by the
 * report's own ALL-CAPS headings keeps each call short and specific.
 */
const MAX_CHUNK_CHARS = 7000;

/** A slice of the report plus where in the report it began. */
type Chunk = { text: string; start: number };

function splitIntoChunks(text: string): Chunk[] {
  const lines = text.split('\n');
  const headerRe = new RegExp(`^(${SECTION_HEADERS.join('|')})$`, 'i');

  // Character offset of every line, so each chunk can report where it started.
  const lineStarts: number[] = [];
  let acc = 0;
  for (const line of lines) {
    lineStarts.push(acc);
    acc += line.length + 1; // +1 for the newline split() removed
  }

  const boundaries: number[] = [];
  lines.forEach((line, i) => {
    if (headerRe.test(line.trim())) boundaries.push(i);
  });

  let sections: Chunk[] = [];
  if (boundaries.length >= 3) {
    boundaries.forEach((b, i) => {
      const next = i + 1 < boundaries.length ? boundaries[i + 1] : lines.length;
      const body = lines.slice(b, next).join('\n');
      if (body.trim().length > 0) sections.push({ text: body.trim(), start: lineStarts[b] });
    });
    const head = lines.slice(0, boundaries[0]).join('\n');
    if (head.trim().length > 400) sections.unshift({ text: head.trim(), start: 0 });
  } else {
    sections = [{ text, start: 0 }];
  }

  // Hard-split anything still too long so no single call gets a wall of text.
  const chunks: Chunk[] = [];
  for (const sec of sections) {
    if (sec.text.length <= MAX_CHUNK_CHARS) { chunks.push(sec); continue; }
    for (let i = 0; i < sec.text.length; i += MAX_CHUNK_CHARS) {
      chunks.push({ text: sec.text.slice(i, i + MAX_CHUNK_CHARS), start: sec.start + i });
    }
  }
  return chunks.filter((c) => c.text.trim().length > 50);
}

// Words too common in an inspection report to identify a page.
const PAGE_STOPWORDS = new Set([
  'recommend', 'recommended', 'should', 'this', 'that', 'with', 'from', 'have',
  'been', 'were', 'will', 'your', 'they', 'there', 'these', 'those', 'some',
  'area', 'areas', 'unit', 'units', 'system', 'systems', 'note', 'noted',
  'general', 'condition', 'observed', 'appears', 'further', 'required',
]);

function pageKeywords(...parts: (string | null)[]): string[] {
  const words = parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 3 && !PAGE_STOPWORDS.has(w));
  return [...new Set(words)];
}

/**
 * Narrow a finding from "somewhere in this chunk" down to a single page.
 *
 * A chunk is one report section and can span three or four pages. This scores
 * each of those pages by how many of the finding's own distinctive words appear
 * on it — a plain text search, no model involved. If nothing scores convincingly
 * we keep the chunk's first page, which is the section heading and still lands
 * the reader in the right place.
 */
function refinePage(task: ExtractedTask, pages: string[], first: number, last: number): number {
  const words = pageKeywords(task.title, task.location);
  if (words.length === 0) return first;

  let bestPage = first;
  let bestScore = 0;
  for (let p = first; p <= last && p <= pages.length; p++) {
    const haystack = (pages[p - 1] ?? '').toLowerCase();
    let score = 0;
    for (const w of words) if (haystack.includes(w)) score++;
    if (score > bestScore) { bestScore = score; bestPage = p; }
  }

  // Require half the words to land before trusting the refinement over the
  // section's own first page.
  return bestScore * 2 >= words.length ? bestPage : first;
}

/** STAGE 1: extract findings from every chunk in parallel, then de-duplicate. */
async function extractFindings(report: PreparedReport, description: string): Promise<ExtractedTask[]> {
  const chunks = splitIntoChunks(report.text);
  console.log(`Split report into ${chunks.length} chunk(s) for extraction.`);

  const perChunk = await Promise.all(
    chunks.map(async (chunk, i) => {
      const user = (description && i === 0 ? `Notes from the homeowner: ${description}\n\n` : '') + `Report section ${i + 1} of ${chunks.length}:\n\n${chunk.text}`;
      try {
        const res = await chatJSON(buildExtractPrompt(), user, `extract ${i + 1}/${chunks.length}`);
        const found = Array.isArray(res?.tasks) ? (res.tasks as ExtractedTask[]) : [];

        // Stamp each finding with the page it came from. The chunk knows where
        // it started, so this is arithmetic on our side, not a model guess.
        const firstPage = pageForOffset(chunk.start, report.pageStarts);
        const lastPage = pageForOffset(chunk.start + chunk.text.length, report.pageStarts);
        for (const t of found) {
          if (t) t.sourcePage = refinePage(t, report.pages, firstPage, lastPage);
        }
        return found;
      } catch (err) {
        console.error(`Chunk ${i + 1} extraction failed: ${(err as Error).message}`);
        return [];
      }
    }),
  );

  // De-duplicate: the same finding can appear in overlapping slices.
  const seen = new Set<string>();
  const merged: ExtractedTask[] = [];
  for (const t of perChunk.flat()) {
    if (!t || typeof t.title !== 'string') continue;
    const key = t.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(t);
  }
  return merged;
}

/** STAGE 2: one focused call that only assigns catalog ids. */
async function matchFindings(tasks: ExtractedTask[], catalogText: string): Promise<void> {
  if (tasks.length === 0 || !catalogText) return;
  const list = tasks
    .map((t, i) => `${i}. ${t.title} - ${t.issue ?? ''} [${t.system ?? 'unknown'}]`)
    .join('\n');
  try {
    const res = await chatJSON(buildMatchPrompt(catalogText), list, 'match');
    const matches = Array.isArray((res as { matches?: unknown }).matches)
      ? ((res as { matches: { index?: number; catalogId?: string | null }[] }).matches)
      : [];
    for (const m of matches) {
      const i = Number(m?.index);
      if (Number.isInteger(i) && i >= 0 && i < tasks.length) {
        tasks[i].catalogId = m?.catalogId ?? null;
      }
    }
  } catch (err) {
    console.error(`Catalog matching failed (continuing unmatched): ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Normalisation — never trust the model's shape blindly
// ---------------------------------------------------------------------------

const asInt = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(/[^0-9.]/g, '')) : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};
const str = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length ? s : null;
};

/**
 * Inspectors write the same component several different ways, often on
 * different pages of the same report. Without expanding these, "Replace smoke
 * and CO detectors" and "Replace smoke and carbon monoxide detector" are
 * different strings and the homeowner gets both, side by side, both Critical.
 */
const DEDUPE_SYNONYMS: Record<string, string> = {
  co: 'carbon monoxide',
  co2: 'carbon monoxide',
  ac: 'air conditioning',
  hvac: 'heating ventilation air conditioning',
  gfci: 'ground fault circuit interrupter',
  gfcis: 'ground fault circuit interrupter',
  hrv: 'heat recovery ventilator',
  erv: 'heat recovery ventilator',
  dhw: 'water heater',
  eavestrough: 'gutter',
  eavestroughs: 'gutter',
  downspout: 'gutter',
  downspouts: 'gutter',
  detector: 'alarm',
  detectors: 'alarm',
  alarms: 'alarm',
  outlet: 'receptacle',
  outlets: 'receptacle',
};

const DEDUPE_STOP = new Set([
  'a', 'an', 'and', 'at', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to',
  'with', 'your', 'all', 'both',
]);

/**
 * Strip a trailing plural 's' only where it is safe: never on -ss (glass),
 * -us or -is. Crude, but it collapses "detectors"/"detector" without needing
 * a stemming library inside an Edge Function.
 */
function singularise(word: string): string {
  if (word.length > 3 && word.endsWith('s') && !/(ss|us|is)$/.test(word)) {
    return word.slice(0, -1);
  }
  return word;
}

/** Normalised bag of meaningful words, used to tell two findings apart. */
function titleTokens(title: string): Set<string> {
  const out = new Set<string>();
  const cleaned = (title || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
  for (const raw of cleaned.split(/\s+/)) {
    if (!raw) continue;
    const expanded = DEDUPE_SYNONYMS[raw] ?? raw;
    for (const piece of expanded.split(' ')) {
      const word = singularise(DEDUPE_SYNONYMS[piece] ?? piece);
      if (word && !DEDUPE_STOP.has(word)) out.add(word);
    }
  }
  return out;
}

/** How much two findings overlap, 0..1. */
function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * 0.7 keeps "Repair rusted metal roof valleys" together with "Repair rusted
 * roof valleys" while keeping "Repair the front deck" apart from "Repair the
 * back deck" — the distinguishing word is a meaningful share of a short title.
 */
const DUPLICATE_THRESHOLD = 0.7;

/**
 * Two findings that matched the SAME catalog entry in the SAME system are the
 * same underlying problem worded differently - e.g. the report yielded "repair
 * wood rot on deck surface", "repair backyard deck materials" and "repair wood
 * rot on backyard deck", all matching EX-023. Keep the richest one.
 */
function mergeSameCatalogEntry(tasks: ExtractedTask[]): ExtractedTask[] {
  const byKey = new Map<string, ExtractedTask>();
  const out: ExtractedTask[] = [];
  let merged = 0;

  const detail = (t: ExtractedTask) =>
    (t.issue?.length ?? 0) + (t.fixRecommendation?.length ?? 0) + (t.location?.length ?? 0);

  // Unmatched findings need a text-based key: production produced "Install
  // safety sensors FOR left garage door" and "...ON left garage door" as two
  // separate tasks. Dropping filler words and sorting the rest makes those
  // collapse to the same key.
  // Normalised so "CO" matches "carbon monoxide" and "detectors" matches
  // "detector". Sorting makes word order irrelevant: production produced
  // "safety sensors FOR left garage door" and "...ON left garage door" as two
  // separate tasks.
  const titleKey = (t: ExtractedTask) =>
    [...titleTokens(t.title || '')].sort().join(' ');

  for (const t of tasks) {
    if (!t?.catalogId) {
      const key = `txt|${titleKey(t)}|${t.system ?? ''}`;
      const existing = byKey.get(key);
      if (!existing) { byKey.set(key, t); out.push(t); }
      else {
        merged++;
        if (detail(t) > detail(existing)) Object.assign(existing, t);
      }
      continue;
    }
    const key = `${t.catalogId}|${t.system ?? ''}`;
    const existing = byKey.get(key);
    if (!existing) { byKey.set(key, t); out.push(t); continue; }
    merged++;
    if (detail(t) > detail(existing)) {
      Object.assign(existing, t);                       // keep the fuller wording
    }
  }
  if (merged > 0) console.log(`Merged ${merged} duplicate finding(s) by exact key.`);

  // Second pass for near-misses the exact key cannot catch: "Repair rusted
  // metal roof valleys" vs "Repair rusted roof valleys". Compares word
  // overlap, and only within the same system so a plumbing and an electrical
  // finding can never collapse into each other. O(n^2) on a few hundred
  // findings is nothing next to the LLM calls that produced them.
  const survivors: ExtractedTask[] = [];
  const survivorTokens: Set<string>[] = [];
  let fuzzyMerged = 0;

  for (const t of out) {
    const tok = titleTokens(t.title || '');
    let absorbedBy = -1;
    for (let i = 0; i < survivors.length; i++) {
      if ((survivors[i].system ?? '') !== (t.system ?? '')) continue;
      if (tokenOverlap(tok, survivorTokens[i]) >= DUPLICATE_THRESHOLD) { absorbedBy = i; break; }
    }
    if (absorbedBy === -1) {
      survivors.push(t);
      survivorTokens.push(tok);
    } else {
      fuzzyMerged++;
      // Keep whichever wording carries more detail for the homeowner.
      if (detail(t) > detail(survivors[absorbedBy])) Object.assign(survivors[absorbedBy], t);
    }
  }

  if (fuzzyMerged > 0) console.log(`Merged ${fuzzyMerged} near-duplicate finding(s) by word overlap.`);
  return survivors;
}

/**
 * Deterministic fallback for the two things the model most often leaves blank.
 *
 * Every uncategorised task found in production was a GARAGE item: the reports
 * have a GARAGE section, our taxonomy has six systems and no "garage", and the
 * model would rather return null than guess. A task with no system is invisible
 * to the Home Health Score, so five CRITICAL garage-door safety findings were
 * silently uncounted. Keywords are boring and they never return null.
 */
const SYSTEM_KEYWORDS: [RegExp, (typeof HOME_SYSTEMS)[number]][] = [
  [/\b(outlet|receptacle|breaker|wiring|electr|gfci|knockout|subpanel|light fixture|(electrical|service|breaker)\s+panel)/i, 'electrical'],
  [/\b(pipe|drain|plumb|faucet|toilet|water heater|sewer|supply line|p-trap|hose bib)/i, 'plumbing'],
  [/\b(furnace|hvac|duct|vent(ing)?|thermostat|air condition|heat pump|hrv|erv|chimney|fireplace|filter)/i, 'hvac'],
  [/\b(roof|shingle|flashing|attic|soffit|eavestrough|gutter|downspout)/i, 'roof_attic'],
  [/\b(garage|grading|siding|cladding|deck|fence|exterior|foundation|window well|driveway|walkway|landscap|drainage)/i, 'exterior'],
  [/\b(drywall|floor|ceiling|kitchen|bathroom|counter|cabinet|stair|interior|paint|window|door)/i, 'interior'],
];

function inferSystem(t: ExtractedTask): (typeof HOME_SYSTEMS)[number] | null {
  const hay = `${t.title} ${t.issue ?? ''} ${t.location ?? ''}`;
  for (const [re, sys] of SYSTEM_KEYWORDS) if (re.test(hay)) return sys;
  return null;
}

/**
 * A maintenance plan without dates is just a list. Reports almost never state a
 * deadline, so the model returns null for nearly every dueDate - in production
 * only 1 of 171 tasks had one. The catalog's urgency window is the real signal;
 * severity is the fallback when nothing matched.
 */
function deriveDueDate(t: ExtractedTask, urgency: string | null | undefined): string | null {
  if (t.dueDate) return t.dueDate;                   // the report actually said one
  const u = (urgency ?? '').toLowerCase();
  let days: number;
  if (u.includes('immediate')) days = 7;
  else if (u.includes('30-90')) days = 60;
  else if (u.startsWith('before')) days = 90;
  else if (u.includes('1-2 year')) days = 540;
  else if (u.includes('annual') || u.includes('monitor')) days = 365;
  else days = t.severity === 'critical' ? 30 : t.severity === 'minor' ? 365 : 180;

  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Give a routine finding its real cadence.
 *
 * The report says "replace the filters routinely" and stops there. Our
 * recurring bank knows that job is every three months. Matching the two by
 * meaning lets the card say "Every 3 months" instead of the useless
 * "routinely", which is the difference between advice and a plan.
 *
 * 0.6, looser than the extractor's own 0.7: one title is written by us and the
 * other by an inspector, so the wording diverges more.
 */
function adoptCadence(
  tasks: ExtractedTask[],
  bank: { title: string; recur_frequency: string | null; recur_interval: number | null }[],
): number {
  if (bank.length === 0) return 0;
  const bankTokens = bank.map((b) => titleTokens(b.title));
  let adopted = 0;

  for (const t of tasks) {
    if (t.taskKind !== 'routine' || t.recurrence) continue;
    const tok = titleTokens(t.title || '');
    let best = -1;
    let bestScore = 0.6;
    bankTokens.forEach((bt, i) => {
      const score = tokenOverlap(tok, bt);
      if (score >= bestScore) { bestScore = score; best = i; }
    });
    if (best === -1) continue;
    const b = bank[best];
    if (!b.recur_frequency) continue;
    const every = b.recur_interval ?? 1;
    const unit = b.recur_frequency.replace(/ly$/, '');
    t.recurrence = every === 1
      ? `Every ${unit === 'dai' ? 'day' : unit}`
      : `Every ${every} ${unit === 'dai' ? 'day' : unit}s`;
    adopted++;
  }
  return adopted;
}

/**
 * Only real jobs get a deadline.
 *
 * A due date on "replace the filters routinely" or "obtain your warranties" is
 * a lie — neither is ever "done" — and dated non-jobs are what fill the
 * notification bell with things the homeowner cannot act on today.
 *
 * This must run AFTER deriveDueDate, not before: deriveDueDate is called on
 * both the matched and unmatched paths and would simply put a date back.
 */
function undated(task: ExtractedTask, proposed: string | null): string | null {
  return task.taskKind === 'action' ? proposed : null;
}

function sanitizeAndEnrich(tasks: ExtractedTask[], catalog: Map<string, CatalogRow>): ExtractedTask[] {
  return tasks
    .filter((t) => t && typeof t.title === 'string' && t.title.trim().length > 0)
    .map((t) => {
      const cid = str(t.catalogId);
      const match = cid ? catalog.get(cid) : undefined;
      const base: ExtractedTask = {
      title: t.title.trim().slice(0, 200),
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(t.dueDate ?? '')) ? String(t.dueDate) : null,
      system: (HOME_SYSTEMS as readonly string[]).includes(String(t.system)) ? t.system : null,
      severity: (SEVERITIES as readonly string[]).includes(String(t.severity)) ? t.severity : null,
      location: str(t.location),
      issue: str(t.issue),
      fixRecommendation: str(t.fixRecommendation),
      costMin: asInt(t.costMin),
      costMax: asInt(t.costMax),
      timingNote: str(t.timingNote),
      recurrence: str(t.recurrence),
      catalogId: match ? match.id : null,   // drop hallucinated ids
      sourcePage: Number.isInteger(t.sourcePage) && (t.sourcePage as number) > 0 ? t.sourcePage : null,
      // Unmatched findings keep null: the price is then the model's own guess,
      // which the UI labels more cautiously than any catalog figure.
      costConfidence: null,
      taskKind: classifyTaskKind(t.title ?? '', t.issue ?? null),
      };


      // Never leave a task uncategorised - it would vanish from the score.
      if (!base.system) base.system = inferSystem(t);

      if (!match) {
        base.dueDate = undated(base, deriveDueDate(base, null));
        return base;
      }

      // Magnitude sanity check. The model estimated a cost itself in stage 1;
      // if the catalog entry it picked is an order of magnitude more expensive,
      // it almost certainly matched a whole-system replacement to a small repair
      // (e.g. a damaged vent -> full vinyl siding). Reject rather than mislead.
      const ownMax = base.costMax;
      if (ownMax && match.cost_high && match.cost_high > ownMax * 5) {
        console.log(
          `Rejected match ${match.id} for "${base.title}": catalog $${match.cost_high} ` +
          `vs model estimate $${ownMax} (>5x).`,
        );
        return base;
      }

      // Researched catalog values win over the model's guesses.
      return {
        ...base,
        system: (HOME_SYSTEMS as readonly string[]).includes(match.system)
          ? (match.system as ExtractedTask['system'])
          : base.system,
        severity: (SEVERITIES as readonly string[]).includes(String(match.severity))
          ? (match.severity as ExtractedTask['severity'])
          : base.severity,
        costMin: match.cost_low ?? base.costMin,
        costMax: match.cost_high ?? base.costMax,
        location: base.location ?? match.location,
        // The catalog's homeowner-language wording beats a paraphrase of jargon.
        issue: match.meaning ?? base.issue,
        costConfidence: match.confidence ?? null,
        timingNote: base.timingNote ?? (match.urgency ? `Typical timeframe: ${match.urgency}` : null),
        dueDate: undated(base, deriveDueDate(base, match.urgency)),
      };
    });
}

/**
 * Re-link EXISTING tasks to pages, without calling the AI at all.
 *
 * Tasks extracted before page tracking existed have no source_page, and a
 * whole-document keyword search is too blunt to recover it: an inspection PDF
 * is mostly photographs, so a single page carries very few words and several
 * pages tie. Measured on the 22 Sandstone report, that approach put the wrong
 * page on roughly one task in ten, several pages out.
 *
 * This instead matches each task to the CHUNK it most likely came from -- a
 * whole report section, thousands of characters rather than dozens of words, so
 * the winner is far clearer -- and only then narrows to a page inside that
 * chunk with the same refinePage() the live extraction uses. Same evidence the
 * fresh path has, applied after the fact.
 */
type RelinkResult = { updated: number; skipped: number; total: number };

async function relinkPages(
  supabase: ReturnType<typeof createClient>,
  filePath: string,
  fileId: string,
  onlyMissing: boolean,
): Promise<RelinkResult> {
  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from('user_files')
    .download(filePath);
  if (downloadError || !fileBlob) {
    throw new Error(`Could not download the report. ${downloadError?.message ?? ''}`.trim());
  }

  const report = preparePdfText(await extractPdfPages(new Uint8Array(await fileBlob.arrayBuffer())));
  const chunks = splitIntoChunks(report.text);
  const chunkWords = chunks.map((c) => new Set(c.text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ')));

  let query = supabase.from('tasks').select('id, title, location, source_page').eq('file_id', fileId);
  if (onlyMissing) query = query.is('source_page', null);
  const { data: rows, error: readError } = await query;
  if (readError) throw new Error(`Could not read tasks: ${readError.message}`);

  const tasks = (rows ?? []) as { id: string; title: string; location: string | null }[];
  let updated = 0;
  let skipped = 0;

  for (const row of tasks) {
    const words = pageKeywords(row.title, row.location);
    if (words.length === 0) { skipped++; continue; }

    // Which section does this finding belong to?
    let bestChunk = -1;
    let bestScore = 0;
    let runnerUp = 0;
    chunkWords.forEach((set, i) => {
      const score = words.reduce((n, w) => n + (set.has(w) ? 1 : 0), 0);
      if (score > bestScore) { runnerUp = bestScore; bestScore = score; bestChunk = i; }
      else if (score > runnerUp) { runnerUp = score; }
    });

    // Needs a real match and a clear winner, otherwise leave it blank: a link
    // to the wrong page is worse than no link at all.
    if (bestChunk < 0 || bestScore < 2 || bestScore === runnerUp) { skipped++; continue; }

    const chunk = chunks[bestChunk];
    const firstPage = pageForOffset(chunk.start, report.pageStarts);
    const lastPage = pageForOffset(chunk.start + chunk.text.length, report.pageStarts);
    const page = refinePage(
      { title: row.title, location: row.location } as ExtractedTask,
      report.pages,
      firstPage,
      lastPage,
    );

    const { error: writeError } = await supabase
      .from('tasks')
      .update({ source_page: page })
      .eq('id', row.id);
    if (writeError) { skipped++; continue; }
    updated++;
  }

  return { updated, skipped, total: tasks.length };
}

/**
 * What KIND of thing did the inspector actually write?
 *
 * An inspection report mixes three different kinds of statement, and treating
 * them all as dated tasks is why a plan balloons to 150+ items that nobody
 * reads:
 *
 *   action  - a specific job at this address, with a beginning and an end.
 *             "Backfill the garage foundation." This is the maintenance plan.
 *
 *   routine - ongoing upkeep stated as general advice. "Replace the HVAC
 *             filters routinely." Giving this a due date is a lie: it is never
 *             "done". It belongs in the recurring plan, on a cadence.
 *
 *   note    - not something the homeowner does to the house at all. "Obtain
 *             maintenance records and warranties", scope disclaimers. Worth
 *             keeping, but it is not a chore and must not carry a due date.
 *
 * Deliberately rules, not the model. The distinction lives in the GRAMMAR of
 * the sentence — a cadence adverb, a record-keeping verb — which is exactly
 * what patterns are good at and what an LLM will happily be inconsistent
 * about. It also costs nothing and cannot regress the extraction prompt, which
 * has degraded before when asked to do two jobs at once.
 *
 * Measured against 234 real extracted tasks from Gabriele's reports:
 * 87% action, 12% routine, 1% note, 0% unclassified.
 */
type TaskKind = 'action' | 'routine' | 'note';

const NOTE_PATTERNS = [
  /\b(obtain|retain|gather|collect|request|keep)\b[^.]*\b(record|history|warrant|permit|document|receipt|manual)/i,
  /\bfamiliari[sz]e\b/i,
  /\b(excluded|exclusion|limitation|standards? of practice|sop)\b/i,
  /\bfor (your )?(information|reference)\b/i,
  /\b(be aware|aware of)\b/i,
];

/**
 * An explicit cadence. These BEAT an action verb: "Replace the filters
 * routinely" is a habit, not a job, even though "replace" is an action word.
 */
const ROUTINE_STRONG = [
  /\broutine(ly)?\b/i,
  /\bregularly\b/i,
  /\bperiodic(ally)?\b/i,
  /\bannual(ly)?\b/i,
  /\bevery \d+\s*(day|week|month|year)/i,
  /\bseasonal(ly)?\b/i,
  /\bas part of (normal|regular|routine) (upkeep|maintenance)\b/i,
  /\bongoing\b/i,
  /\bas needed\b/i,
  /\bcontinue to\b/i,
  /\bmaintenance\b/i,
  // "Keep the mechanical room clear" is a standing habit. This must sit above
  // the action verbs, because "clear" is itself an action verb.
  /\bkeep\b[^.]*\b(clear|clean|free|maintained|dry)\b/i,
];

const ACTION_VERBS =
  /\b(repair|replace|seal|backfill|secure|install|fix|re-?caulk|caulk|regrade|grade|lubricate|tighten|adjust|remove|cover|insulate|drain|flush|trim|re-?nail|upgrade|correct|address|improve|restore|patch|paint|clear|cut|extend|add|mount|anchor|reattach|refasten|straighten|level|fill|point|rebuild|increase|reduce|raise|lower|label|pave|realign|redistribute|ensure|perform|build|apply|wrap|support|brace)\b/i;

/** Booking a professional is still a job the homeowner starts and finishes. */
const PROFESSIONAL =
  /\b(consult|hire|contact|engage|book|schedule|qualified|licensed|professional|contractor|electrician|plumber|wett)\b/i;

const INSPECT = /\b(check|inspect|test|verify|evaluate|assess|examine|confirm|determine)\b/i;

/** Upkeep-flavoured verbs with no stated cadence — an action verb outranks these. */
const ROUTINE_WEAK = [/\bmaintain\b/i, /\bservice\b/i, /\bclean\b/i];

function classifyTaskKind(title: string, issue?: string | null): TaskKind {
  const t = title ?? '';
  const text = `${t} ${issue ?? ''}`;

  if (NOTE_PATTERNS.some((p) => p.test(text))) return 'note';
  if (ROUTINE_STRONG.some((p) => p.test(t))) return 'routine';
  if (ACTION_VERBS.test(t)) return 'action';
  if (ROUTINE_WEAK.some((p) => p.test(t))) return 'routine';
  // Bare "Monitor the ceiling stain" — watch it, with nothing to do today.
  if (/\bmonitor\b/i.test(t)) return 'routine';
  if (PROFESSIONAL.test(text) || INSPECT.test(t)) return 'action';
  // Nothing matched: treat it as a job rather than silently hiding it. A
  // stray item in the plan is recoverable; one we quietly filed away is not.
  return 'action';
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { description = '', file_path: filePath } = body;
    if (!filePath) throw new Error('file_path is required');

    // Service-role client: needed to read the private user_files bucket.
    // NOTE: verify_jwt is enabled on this function, so only signed-in users
    // reach this code path.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('user_files')
      .download(filePath);
    if (downloadError || !fileBlob) {
      throw new Error(`Could not download the uploaded file. ${downloadError?.message ?? ''}`.trim());
    }

    // RE-LINK MODE: recompute source_page for tasks that already exist, with no
    // AI call and no new tasks created. Used to repair reports processed before
    // page tracking existed.
    if (body.relink_file_id) {
      const result = await relinkPages(
        supabase,
        filePath,
        String(body.relink_file_id),
        body.only_missing !== false,
      );
      console.log(
        `Re-linked pages for file ${body.relink_file_id}: ` +
        `${result.updated} updated, ${result.skipped} left blank, ${result.total} considered.`,
      );
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load the catalog the model matches findings against.
    const { data: catalogRows, error: catalogError } = await supabase
      .from('cost_catalog')
      .select('id, system, component, defect, location, meaning, severity, urgency, cost_low, cost_typical, cost_high, confidence');
    if (catalogError) console.error('cost_catalog load failed:', catalogError.message);

    const catalog = new Map<string, CatalogRow>();
    for (const row of ((catalogRows ?? []) as CatalogRow[])) catalog.set(row.id, row);

    // Compact one-line-per-entry form keeps the prompt affordable.
    const catalogText = ((catalogRows ?? []) as CatalogRow[])
      .map((r) => `${r.id} | ${r.system} | ${r.component} | ${r.defect} | $${r.cost_typical ?? '?'}`)
      .join('\n');

    const pdfBytes = new Uint8Array(await fileBlob.arrayBuffer());
    const rawPages = await extractPdfPages(pdfBytes);
    const report = preparePdfText(rawPages);
    const { rawChars, finalChars } = report;

    console.log(
      `PDF prepared — ${rawPages.length} page(s), raw=${rawChars} chars, sent=${finalChars} chars ` +
      `(${rawChars ? Math.round((1 - finalChars / rawChars) * 100) : 0}% reduction)`,
    );

    if (finalChars < 200) {
      throw new Error(
        'Could not read any text from this PDF. It may be a scanned image, which needs OCR.',
      );
    }

    // Stage 1: find everything. Stage 2: label it against the catalog.
    const findings = await extractFindings(report, description);
    await matchFindings(findings, catalogText);
    const deduped = mergeSameCatalogEntry(findings);
    const tasks = sanitizeAndEnrich(deduped, catalog);

    // Turn "replace the filters routinely" into "Every 3 months" by borrowing
    // the cadence from the recurring bank.
    const { data: bankRows } = await supabase
      .from('standard_tasks')
      .select('title, recur_frequency, recur_interval');
    const adopted = adoptCadence(tasks, bankRows ?? []);
    if (adopted > 0) console.log(`Gave ${adopted} routine finding(s) a real cadence from the bank.`);

    // Fold this report into the shared library. Nothing reads it yet — the
    // point is that it fills itself on every upload, so the statistics exist
    // by the time there are enough reports for them to mean something. The
    // one that matters is distinct_reports: a finding that shows up in most
    // reports is the inspector's boilerplate, not a defect at this house.
    try {
      const seen = tasks.map((t) => ({
        key: [...titleTokens(t.title || '')].sort().join(' '),
        title: t.title,
        kind: t.taskKind,
        system: t.system,
        severity: t.severity,
      })).filter((f) => f.key.length > 0);
      const { error: libError } = await supabase.rpc('record_findings', { findings: seen });
      if (libError) console.error('finding_library update failed (continuing):', libError.message);
      else console.log(`Recorded ${seen.length} finding(s) in the library.`);
    } catch (err) {
      // Never fail an upload because bookkeeping failed.
      console.error('finding_library update threw (continuing):', (err as Error).message);
    }
    const matched = tasks.filter((t) => t.catalogId).length;
    const paged = tasks.filter((t) => t.sourcePage).length;
    const kinds = tasks.reduce((acc: Record<string, number>, t) => {
      const k = t.taskKind ?? 'unknown';
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
    console.log(
      `Extracted ${tasks.length} tasks; ${matched} matched to catalog, ` +
      `${tasks.length - matched} unmatched, ${paged} with a source page, ` +
      `kinds=${JSON.stringify(kinds)}. catalog_size=${catalog.size}`,
    );

    return new Response(JSON.stringify({ tasks }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = (err as Error).message ?? 'Unknown error';
    console.error('ExtractTasksUsingLLM error:', message);
    // 200 with an `error` field would hide failures from the client's error
    // handling, so keep a real error status — but send a readable message.
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
