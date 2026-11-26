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
  /** Came from the inspector's summary section — see findSummaryRange(). */
  fromSummary: boolean;
  /** Why this is a safety matter, when it is one — see safetyReason(). */
  safetyReason?: string | null;
  /**
   * The inspector's own sentence(s), copied verbatim by the model and then
   * CHECKED against the PDF text (locateQuote). Unverified quotes are dropped
   * before anything is returned — the app never shows words the inspector
   * did not write.
   */
  quote?: string | null;
  /** Plain-English reason for the severity, shown next to it as proof. */
  severityReason?: string | null;
  /** Parsed from `recurrence` so the confirm screen shows the real schedule. */
  recurFrequency?: 'daily' | 'weekly' | 'monthly' | 'yearly' | null;
  recurInterval?: number | null;
  /** Days from the inspection the report allows — lets the app re-date if the
      homeowner corrects the inspection date on the confirm screen. */
  dueWindowDays?: number | null;
  /** The report's own deadline had already passed when it was uploaded. */
  carriedOver?: boolean;
  /** Where the verified quote sits in the page's normalised text. Internal. */
  quoteAt?: { page: number; start: number; end: number } | null;
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

ONE FINDING = OBSERVATION + RECOMMENDATION
An observation and the recommendation that follows it are ONE finding, even
when they are two sentences ("There is a drain leak at the second floor
bathroom sink drain. Recommend repair by a qualified plumber to prevent water
damage."). Never return the recommendation sentence as a separate finding.

ONE JOB PER FINDING
If one sentence asks for two different jobs, return TWO findings. Example:
"Furnaces require regular servicing; recommend following the manufacturer's
guidelines and replace disposable filters every 3 months." is
  1) "Service the furnace yearly"  and  2) "Replace the furnace filter" (every 3 months).

FIELDS per finding
- quote: the inspector's EXACT words for this finding — copy the sentence(s)
  character for character from the text, 1 to 3 sentences, including any URL.
  Never paraphrase, never fix typos, never join text from different places.
  This is shown to the homeowner as proof, and it is checked against the PDF.
- title: short, action-first, specific ("Reseal roof flashing at the chimney").
  Never just repeat the component name.
- issue: 1-2 plain sentences on what is wrong, for a homeowner.
- fixRecommendation: 1-2 sentences on the fix, from the report's wording.
- location: where it is, or null.
- system: EXACTLY one of ${HOME_SYSTEMS.join(', ')} - judge by CONTENT:
  wiring/outlets/panels -> electrical; pipes/drains/water heater -> plumbing;
  furnace/AC/ducts -> hvac; roof/attic -> roof_attic; grading/siding/gutters/
  garage -> exterior; kitchen/bathroom/living space -> interior.
- severity, using THIS rubric (the words "recommend"/"should" alone decide nothing):
    critical = someone could get hurt (fire, shock, gas, carbon monoxide, falls,
               trip hazards, missing alarms); OR water is getting in right now
               (any leak, water entry, sewage); OR the damage spreads or becomes
               very expensive if left (structural movement or rot, sewer/main
               line problems, mould); OR the report says ASAP / immediately /
               as soon as possible.
    moderate = a real repair or evaluation the report recommends to prevent
               future damage, with no immediate danger.
    minor    = small, cosmetic, convenience, or "for your information".
- severityReason: under 10 words, WHY — name the trigger from the text
  ("Active leak - water damage and mould risk", "Report says ASAP",
  "Fall hazard on deck", "Cosmetic wear only").
- costMin/costMax: rough CAD integers, or null.
- dueDate: ISO YYYY-MM-DD only if the report states/implies one, else null.
- timingNote: short and practical, or null.
- recurrence: the interval EXACTLY as the report states it, normalised to
  "Every N days|weeks|months|years" ("Every 2 years", "Every 3 months",
  "Every 5 years", "Every 1 years" for yearly). null if not recurring upkeep.

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

  /**
   * gpt-4o-mini shuts down on 14 Jan 2027 (OpenAI deprecations page, checked
   * 2026-11-24), so the model is chosen by the OPENAI_MODEL secret — switching
   * is a dashboard change, not a redeploy (BENI-66).
   *
   * The GPT-5/6 and o-series models are reasoning models and take different
   * parameters: no custom temperature, and a reasoning effort instead. "low"
   * is right for extraction — the work is careful reading, not puzzle-solving,
   * and reasoning tokens are billed as output.
   */
  const isReasoningModel = /^(gpt-[5-9]|o\d)/i.test(model);
  const tuning = isReasoningModel
    ? { reasoning_effort: Deno.env.get('OPENAI_REASONING_EFFORT') ?? 'low' }
    : { temperature: 0.1 };

  const MAX_ATTEMPTS = 3;
  let lastError = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        ...tuning,
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
 *
 * 3,500 (was 7,000): the calls run in parallel, so the upload takes as long
 * as the SLOWEST section. Measured on the founder's report (2026-11-25): 9
 * sections, 48-65 s of a 59-74 s upload, dominated by the two biggest. Half
 * the size means twice the calls but each returns in about half the time —
 * and now that every finding carries a verbatim quote, output is longer.
 */
const MAX_CHUNK_CHARS = 3500;

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

  // Split anything still too long — at a LINE break, never mid-sentence. The
  // old fixed-size slice could cut one finding across two calls, and each
  // half then came back as its own (wrong) task.
  const chunks: Chunk[] = [];
  for (const sec of sections) {
    if (sec.text.length <= MAX_CHUNK_CHARS) { chunks.push(sec); continue; }
    let i = 0;
    while (i < sec.text.length) {
      let end = Math.min(i + MAX_CHUNK_CHARS, sec.text.length);
      if (end < sec.text.length) {
        const para = sec.text.lastIndexOf('\n\n', end);
        const line = sec.text.lastIndexOf('\n', end);
        const cut = para > i + MAX_CHUNK_CHARS / 2 ? para : line > i + MAX_CHUNK_CHARS / 2 ? line : end;
        end = cut;
      }
      chunks.push({ text: sec.text.slice(i, end), start: sec.start + i });
      i = end;
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

// ---------------------------------------------------------------------------
// Proof: find the inspector's exact words in the PDF (BENI-69)
// ---------------------------------------------------------------------------

/** Lower-case, punctuation-free, single-spaced — so line breaks and the PDF's
    hyphenation can't stop an exact sentence from matching. */
function normProof(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function fourGrams(words: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 4 <= words.length; i++) out.add(words.slice(i, i + 4).join(' '));
  return out;
}

/** Normalised text + 4-word phrases of every page, built once per report. */
type ProofIndex = { norm: string[]; grams: Set<string>[] };

function buildProofIndex(pages: string[]): ProofIndex {
  const norm = pages.map(normProof);
  return { norm, grams: norm.map((p) => fourGrams(p.split(' '))) };
}

/** A quote must match this closely to be SHOWN as the inspector's words. */
const QUOTE_SHOW_SCORE = 0.85;
/** ...and this closely to be trusted for the PAGE only. */
const QUOTE_PAGE_SCORE = 0.6;

/**
 * Where does this quote appear, and how sure are we?
 *
 * Keyword scoring (refinePage) put the deck-railing finding on the gutter page
 * of the founder's own report — page 5 instead of 8 — because both pages talk
 * about the exterior. A verbatim sentence has no such ambiguity: it is on one
 * page. Exact match first; failing that, the share of the quote's 4-word
 * phrases found on a page, which survives line breaks and small OCR noise.
 *
 * Pages inside the finding's own chunk are preferred: summaries often repeat
 * the body word for word, and the body page is where the photo is.
 */
function locateQuote(
  quote: string | null | undefined,
  index: ProofIndex,
  first: number,
  last: number,
): { page: number; score: number; start?: number; end?: number } | null {
  const nq = normProof(quote ?? '');
  const words = nq.split(' ').filter(Boolean);
  if (words.length < 5) return null;

  const order: number[] = [];
  for (let p = first; p <= last; p++) if (p >= 1 && p <= index.norm.length) order.push(p);
  for (let p = 1; p <= index.norm.length; p++) if (!order.includes(p)) order.push(p);

  for (const p of order) {
    const at = index.norm[p - 1].indexOf(nq);
    if (at >= 0) return { page: p, score: 1, start: at, end: at + nq.length };
  }

  const qGrams = fourGrams(words);
  if (qGrams.size === 0) return null;
  let best: { page: number; score: number } | null = null;
  for (const p of order) {
    let hit = 0;
    for (const g of qGrams) if (index.grams[p - 1].has(g)) hit++;
    const score = hit / qGrams.size;
    if (!best || score > best.score) best = { page: p, score };
  }
  return best && best.score >= QUOTE_PAGE_SCORE ? best : null;
}

/**
 * Is one quote just the recommendation that follows the other's observation?
 *
 * First live run: "There is a drain leak at the second floor bathroom." and
 * "Recommend repair by a qualified plumber to prevent water damage..." came
 * back as two tasks. They are consecutive sentences of one finding. The test
 * is narrow on purpose — same page, touching (within a few characters), and
 * one of them is a bare "Recommend..." sentence — so two genuinely separate
 * findings that happen to sit next to each other are never merged.
 */
function isSplitFinding(a: ExtractedTask, b: ExtractedTask): boolean {
  const qa = a.quoteAt, qb = b.quoteAt;
  if (!qa || !qb || qa.page !== qb.page) return false;
  const [first, second] = qa.start <= qb.start ? [a, b] : [b, a];
  const gap = second.quoteAt!.start - first.quoteAt!.end;
  if (gap < 0 || gap > 40) return false;
  return /^\s*(i\s+)?recommend/i.test(second.quote ?? '');
}

/** How alike two quotes are (0..1) — the same sentence quoted twice is the
    same finding, whatever titles the model gave it. */
function quoteOverlap(a: string | null | undefined, b: string | null | undefined): number {
  const na = normProof(a ?? ''), nb = normProof(b ?? '');
  if (na.split(' ').length < 5 || nb.split(' ').length < 5) return 0;
  if (na.includes(nb) || nb.includes(na)) return 1;
  const ga = fourGrams(na.split(' ')), gb = fourGrams(nb.split(' '));
  let shared = 0;
  for (const g of ga) if (gb.has(g)) shared++;
  return shared / Math.max(1, Math.min(ga.size, gb.size));
}

// ---------------------------------------------------------------------------
// Inspection date (BENI-70)
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function isoOrNull(y: number, m: number, d: number): string | null {
  if (!(y >= 1990 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;                 // 31 Feb etc.
  if (dt.getTime() > Date.now() + 86_400_000) return null;       // not in the future
  return dt.toISOString().slice(0, 10);
}

/** Parse the first date found at the START of `s`, in the formats inspection
    software actually prints. Numeric d/m/y is read month-first (North America)
    unless the first number cannot be a month. */
function parseLeadingDate(s: string): string | null {
  let m = s.match(/^\s*(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return isoOrNull(+m[1], +m[2], +m[3]);
  const monthOf = (word: string): number | undefined =>
    MONTHS[word.slice(0, 4).toLowerCase()] ?? MONTHS[word.slice(0, 3).toLowerCase()];

  // "Friday, December 28, 2018" / "Dec 28 2018"
  m = s.match(/^\s*(?:[A-Za-z]+,?\s+)?([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
  if (m && monthOf(m[1])) return isoOrNull(+m[3], monthOf(m[1])!, +m[2]);

  // "28 December 2018"
  m = s.match(/^\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/);
  if (m && monthOf(m[2])) return isoOrNull(+m[3], monthOf(m[2])!, +m[1]);
  m = s.match(/^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const a = +m[1], b = +m[2];
    return a > 12 ? isoOrNull(y, b, a) : isoOrNull(y, a, b);
  }
  return null;
}

const INSPECTION_DATE_LABEL =
  /(inspection date|date of inspection|date inspected|inspected on|inspection performed on|date of service|service date|inspection on|\bdate)\s*[:\-–]?\s*/gi;

/**
 * Read the inspection date off the first pages of the report.
 *
 * Only LABELLED dates count ("Date: 2018-12-28", "Inspection Date: Dec 28,
 * 2018"): a bare date on a cover page is as likely to be the print date or a
 * licence expiry. Returns null when unsure — the confirm screen then asks
 * the homeowner, which is better than guessing.
 */
function findInspectionDate(pages: string[]): { date: string; page: number } | null {
  for (let p = 0; p < Math.min(3, pages.length); p++) {
    const text = pages[p] ?? '';
    INSPECTION_DATE_LABEL.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = INSPECTION_DATE_LABEL.exec(text)) !== null) {
      const date = parseLeadingDate(text.slice(m.index + m[0].length, m.index + m[0].length + 40));
      if (date) return { date, page: p + 1 };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Scheduling, anchored to the inspection date (BENI-70)
// ---------------------------------------------------------------------------

type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly';

/** "Every 2 years" / "annually" / "every 3 months" -> a real schedule. */
function parseRecurrenceText(text: string | null | undefined): { frequency: Freq; interval: number } | null {
  if (!text) return null;
  const t = text.toLowerCase();
  const n = parseInt((t.match(/\d+/) ?? ['1'])[0], 10);
  let interval = Number.isFinite(n) && n > 0 ? n : 1;
  if (/twice a year|semi[- ]?annual|bi[- ]?annual/.test(t)) return { frequency: 'monthly', interval: 6 };
  if (/quarter/.test(t)) return { frequency: 'monthly', interval: 3 };
  if (/\bdai|\bday/.test(t)) return { frequency: 'daily', interval };
  if (/week/.test(t)) return { frequency: 'weekly', interval };
  if (/month/.test(t)) {
    // "Every 12 months" reads better as yearly.
    if (interval % 12 === 0) return { frequency: 'yearly', interval: interval / 12 };
    return { frequency: 'monthly', interval };
  }
  if (/year|annual|season/.test(t)) return { frequency: 'yearly', interval: Math.min(interval, 25) };
  return null;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addInterval(iso: string, f: Freq, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  if (f === 'daily') d.setUTCDate(d.getUTCDate() + n);
  else if (f === 'weekly') d.setUTCDate(d.getUTCDate() + 7 * n);
  else if (f === 'monthly') d.setUTCMonth(d.getUTCMonth() + n);
  else d.setUTCFullYear(d.getUTCFullYear() + n);
  return d.toISOString().slice(0, 10);
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** When the report's own deadline has already passed, the job is due now —
    you cannot do it in the past. How "now" depends on how much it matters. */
function catchUpDays(severity: string | null): number {
  return severity === 'critical' ? 14 : severity === 'moderate' ? 30 : 60;
}

/**
 * Give every task its schedule, measured from the day the home was inspected.
 *
 *  - Jobs (action): inspection date + the window the report/catalog allows.
 *    If that has already passed (an older report), due soon, flagged as
 *    carried over so the homeowner can delete it if it's already done.
 *  - Upkeep (routine): next occurrence after the inspection. "Every 2 years"
 *    from a December 2018 inspection was due December 2020 — BENi has no
 *    evidence it was done since, so it's due now, not silently skipped ahead.
 *  - Notes: no date. They are not jobs.
 *
 * Without an inspection date we fall back to today, which is what the app did
 * before — and the confirm screen asks the homeowner to fill the date in.
 */
function scheduleTasks(tasks: ExtractedTask[], inspectionDate: string | null): void {
  const today = todayIso();
  const base = inspectionDate ?? today;

  for (const t of tasks) {
    const cadence = parseRecurrenceText(t.recurrence);

    if (t.taskKind === 'note' && !cadence) { t.dueDate = null; continue; }

    // One definition (BENI-53): a task on a schedule is routine.
    if (cadence || t.taskKind === 'routine') {
      const c = cadence ?? { frequency: 'yearly' as Freq, interval: 1 };
      t.taskKind = 'routine';
      t.recurFrequency = c.frequency;
      t.recurInterval = c.interval;
      if (!t.recurrence) t.recurrence = c.interval === 1 ? 'Yearly' : `Every ${c.interval} years`;
      const next = addInterval(base, c.frequency, c.interval);
      if (next < today) {
        t.dueDate = addDays(today, 30);
        t.carriedOver = true;
      } else {
        t.dueDate = next;
      }
      t.dueWindowDays = null;
      continue;
    }

    // A deadline the report actually printed wins over any window.
    if (t.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate)) continue;

    const window = t.dueWindowDays ?? (t.severity === 'critical' ? 30 : t.severity === 'minor' ? 365 : 180);
    const target = addDays(base, window);
    if (target < today) {
      t.dueDate = addDays(today, catchUpDays(t.severity));
      t.carriedOver = true;
    } else {
      t.dueDate = target;
    }
  }
}

/**
 * Find the inspector's summary section.
 *
 * The summary is where the inspector says what actually matters, and Gabriele
 * is right that it deserves more weight than page 40 of the photo appendix.
 * The problem is recognising it.
 *
 * TWO APPROACHES MEASURED AND REJECTED, across 26 real reports:
 *   - a literal "summary" page footer: present in only 10 of 26
 *   - "<System> Observations:" headings: only 5 of 26
 * The template has changed over the years, so anything keyed to layout misses
 * most of the corpus.
 *
 * WHAT WORKS: density. Wherever those markers DID exist, the section they
 * marked carried about ten times as many "recommend" statements per page as
 * the rest of the document. So find the run of pages with the most
 * recommendations instead of looking for a heading — that depends on what the
 * inspector WROTE, not on how the PDF was laid out, and it works on all 26.
 *
 * Measured with the window below, constrained to the front 45%: median 5.4x
 * the density of the rest of the report, and the window lands at a median 17%
 * into the document — which is exactly where the footer-marked sections sat
 * (13-18%). Two independent methods agreeing is the reason to trust it.
 */
const SUMMARY_WINDOW_PAGES = 4;      // marked sections ran 3-7 pages, median 4
const SUMMARY_FRONT_FRACTION = 0.45; // summaries are front-loaded
const SUMMARY_MIN_RATIO = 2;         // below this, assume there is no summary

type SummaryRange = { startPage: number; endPage: number; ratio: number } | null;

function findSummaryRange(pages: string[]): SummaryRange {
  const n = pages.length;
  if (n < SUMMARY_WINDOW_PAGES * 2) return null;

  const counts = pages.map((p) => (p.match(/recommend/gi) ?? []).length);
  const total = counts.reduce((a, b) => a + b, 0);
  if (total < 5) return null;

  const limit = Math.max(1, Math.floor(n * SUMMARY_FRONT_FRACTION) - SUMMARY_WINDOW_PAGES + 1);
  let bestStart = 0;
  let bestSum = -1;
  for (let i = 0; i < limit; i++) {
    let s = 0;
    for (let k = i; k < i + SUMMARY_WINDOW_PAGES && k < n; k++) s += counts[k];
    if (s > bestSum) { bestSum = s; bestStart = i; }
  }

  const end = Math.min(n - 1, bestStart + SUMMARY_WINDOW_PAGES - 1);
  const insidePages = end - bestStart + 1;
  const outsideTotal = total - bestSum;
  const outsidePages = Math.max(1, n - insidePages);
  const inside = bestSum / insidePages;
  const outside = outsideTotal / outsidePages;
  const ratio = outside > 0 ? inside / outside : (inside > 0 ? 99 : 0);

  // A flat report has no summary to find. Saying so is better than crowning
  // an arbitrary four pages and treating them as the inspector's priorities.
  if (ratio < SUMMARY_MIN_RATIO) return null;

  return { startPage: bestStart + 1, endPage: end + 1, ratio };
}

/** Character span of the summary in the prepared text, or null. */
function summaryOffsets(
  report: PreparedReport,
  range: SummaryRange,
): { start: number; end: number } | null {
  if (!range) return null;
  const startIdx = range.startPage - 1;
  const endIdx = range.endPage - 1;
  const start = report.pageStarts[startIdx] ?? 0;
  const end = endIdx + 1 < report.pageStarts.length
    ? report.pageStarts[endIdx + 1]
    : report.text.length;
  return { start, end };
}

/** STAGE 1: extract findings from every chunk in parallel, then de-duplicate. */
async function extractFindings(report: PreparedReport, description: string): Promise<ExtractedTask[]> {
  const chunks = splitIntoChunks(report.text);
  console.log(`Split report into ${chunks.length} chunk(s) for extraction.`);

  const range = findSummaryRange(report.pages);
  const span = summaryOffsets(report, range);
  if (range) {
    console.log(
      `Summary section: pages ${range.startPage}-${range.endPage} ` +
      `(${range.ratio.toFixed(1)}x the recommendation density of the rest).`,
    );
  } else {
    console.log('No distinct summary section found in this report.');
  }

  const proof = buildProofIndex(report.pages);
  let quotesShown = 0, quotesPageOnly = 0, quotesMissed = 0;

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
        // Does this chunk overlap the summary? Told to the model as context
        // AND recorded on each finding, so the homeowner can see what the
        // inspector himself chose to call out.
        const chunkEnd = chunk.start + chunk.text.length;
        const inSummary = !!span && chunk.start < span.end && chunkEnd > span.start;

        for (const t of found) {
          if (!t) continue;
          // The inspector's own sentence decides the page when we can find it
          // in the PDF; keyword scoring is only the fallback (BENI-69).
          const located = locateQuote(t.quote, proof, firstPage, lastPage);
          if (located) {
            t.sourcePage = located.page;
            t.quoteAt = located.start !== undefined
              ? { page: located.page, start: located.start, end: located.end! }
              : null;
            if (located.score >= QUOTE_SHOW_SCORE) {
              t.quote = String(t.quote).replace(/\s+/g, ' ').trim().slice(0, 700);
              quotesShown++;
            } else {
              // Close enough to trust the page, not close enough to put the
              // words in the inspector's mouth.
              t.quote = null;
              quotesPageOnly++;
            }
          } else {
            t.sourcePage = refinePage(t, report.pages, firstPage, lastPage);
            t.quote = null;
            quotesMissed++;
          }
          t.fromSummary = inSummary;
        }
        return found;
      } catch (err) {
        console.error(`Chunk ${i + 1} extraction failed: ${(err as Error).message}`);
        return [];
      }
    }),
  );

  console.log(
    `Proof: ${quotesShown} verbatim quote(s) verified, ${quotesPageOnly} page-only, ` +
    `${quotesMissed} not found (keyword page fallback).`,
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

/**
 * Findings per matching call.
 *
 * Measured: matching all ~80 findings in ONE call took 10.7s of a 28s
 * extraction — 38% of the total, and the only serial LLM step left (stage 1 is
 * already parallel). The model has to read the whole catalog and emit every
 * match before a single token is useful to us.
 *
 * Splitting into batches lets them run at the same time. The catalog is
 * repeated in each prompt, so this costs more input tokens — roughly a tenth
 * of a cent per report — in exchange for seconds off the wait on every single
 * upload. Worth it: the user is sitting watching a spinner.
 *
 * 25 keeps each batch's output clear of the token limit while needing only
 * three or four calls for a typical report.
 */
const MATCH_BATCH_SIZE = 25;

async function matchFindings(tasks: ExtractedTask[], catalogText: string): Promise<void> {
  if (tasks.length === 0 || !catalogText) return;

  const batches: { offset: number; items: ExtractedTask[] }[] = [];
  for (let i = 0; i < tasks.length; i += MATCH_BATCH_SIZE) {
    batches.push({ offset: i, items: tasks.slice(i, i + MATCH_BATCH_SIZE) });
  }

  await Promise.all(batches.map(async (batch, b) => {
    // Indices are LOCAL to each batch in the prompt and resolved back against
    // that batch here. Asking the model to work with global offsets is a
    // needless chance for it to drift, and a drifted index silently attaches
    // the wrong price to the wrong finding.
    const list = batch.items
      .map((t, i) => `${i}. ${t.title} - ${t.issue ?? ''} [${t.system ?? 'unknown'}]`)
      .join('\n');
    try {
      const res = await chatJSON(
        buildMatchPrompt(catalogText), list, `match ${b + 1}/${batches.length}`,
      );
      const matches = Array.isArray((res as { matches?: unknown }).matches)
        ? ((res as { matches: { index?: number; catalogId?: string | null }[] }).matches)
        : [];
      for (const m of matches) {
        const i = Number(m?.index);
        if (Number.isInteger(i) && i >= 0 && i < batch.items.length) {
          batch.items[i].catalogId = m?.catalogId ?? null;
        }
      }
    } catch (err) {
      // One failed batch leaves only its own findings unmatched; the rest
      // still get their real Calgary costs.
      console.error(`Catalog matching batch ${b + 1} failed: ${(err as Error).message}`);
    }
  }));
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

/**
 * Tokens for deciding whether two findings are the SAME DEFECT (BENI-65).
 *
 * Separate from titleTokens on purpose: titleTokens also keys the shared
 * finding library and the recurring-bank match, and changing it would split
 * every library row collected since September.
 *
 * Two differences:
 *   1. Action verbs are dropped. "Install safety handrails on rear deck" and
 *      "Install handrails on rear deck stairs" are one job; so are "Install
 *      safety sensors on left garage door" and "Repair non-functional garage
 *      door safety sensors". The verb is how to fix it, not what is wrong.
 *   2. Common multi-word components become ONE token first. Otherwise "hot
 *      water tank" counts as three shared facts and "Confirm insurance
 *      coverage for hot water tank" merges with "Evaluate right hot water
 *      tank" — the one false positive found when this was tested against all
 *      339 findings in the database (2026-11-24).
 */
const DEFECT_COMPOUNDS: [RegExp, string][] = [
  [/hot water (tank|heater)s?|water heaters?|dhw tank/g, 'waterheater'],
  [/garage doors?/g, 'garagedoor'],
  [/(electrical|breaker|service) panels?/g, 'elecpanel'],
  [/sump pumps?/g, 'sumppump'],
  [/exhaust fans?/g, 'exhaustfan'],
  [/smoke (and|&) (co|carbon monoxide) (alarms?|detectors?)/g, 'smokecoalarm'],
  [/dryer vents?/g, 'dryervent'],
];

const DEFECT_VERBS = new Set([
  'repair', 'replace', 'install', 'fix', 'address', 'evaluate', 'check', 'inspect',
  'clean', 'service', 'improve', 'seal', 'maintain', 'monitor', 'consult', 'have',
  'hire', 'schedule', 'further', 'ensure', 'perform', 'obtain', 'correct', 'adjust',
  'secure', 'upgrade', 'add', 'remove', 'tighten', 'review', 'consider', 'recommend',
]);

function defectTokens(title: string): Set<string> {
  let s = (title || '').toLowerCase().replace(/[^a-z0-9 &]/g, ' ');
  for (const [re, rep] of DEFECT_COMPOUNDS) s = s.replace(re, rep);
  const out = new Set<string>();
  for (const raw of s.replace(/&/g, ' ').split(/\s+/)) {
    if (!raw) continue;
    const expanded = DEDUPE_SYNONYMS[raw] ?? raw;
    for (const piece of expanded.split(' ')) {
      const word = singularise(DEDUPE_SYNONYMS[piece] ?? piece);
      if (word && !DEDUPE_STOP.has(word) && !DEFECT_VERBS.has(word)) out.add(word);
    }
  }
  return out;
}

/**
 * Share of the SHORTER title that the longer one contains. Catches "Fix sink
 * drain stopper" inside "Fix non-functioning sink drain stopper", which
 * Jaccard scores at only 0.6 because the longer title has more words. Only
 * trusted when the shorter title has 3+ meaningful words: with 2, "garage
 * subpanel" would swallow every garage-subpanel finding regardless of defect.
 */
function containment(a: Set<string>, b: Set<string>): number {
  const smaller = Math.min(a.size, b.size);
  if (smaller < 3) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / smaller;
}

const CONTAINMENT_THRESHOLD = 0.75;

const SEVERITY_RANK: Record<string, number> = { critical: 3, moderate: 2, minor: 1 };

/**
 * Fold a duplicate into the finding we are keeping, without losing anything.
 *
 * This used to be Object.assign(keeper, richer): the wordier copy replaced the
 * other wholesale, so the merged task could inherit a worse page, a lower
 * severity, or no cost match. Now the fuller wording still wins, but:
 *   - a page from the report body beats a page from the summary (the body is
 *     where the photos and detail are);
 *   - the higher severity survives — a duplicate must never downgrade a hazard;
 *   - a catalog match and its cost are kept if either copy had them;
 *   - "the inspector called this out in the summary" survives too.
 */
function absorb(keeper: ExtractedTask, other: ExtractedTask): void {
  const detail = (t: ExtractedTask) =>
    (t.issue?.length ?? 0) + (t.fixRecommendation?.length ?? 0) + (t.location?.length ?? 0);

  const bodyPage = [keeper, other].find((t) => t.sourcePage && !t.fromSummary)?.sourcePage;
  const anyPage = keeper.sourcePage ?? other.sourcePage;
  const otherIsWorse = (SEVERITY_RANK[other.severity ?? ''] ?? 0) > (SEVERITY_RANK[keeper.severity ?? ''] ?? 0);
  const severity = otherIsWorse ? other.severity : keeper.severity;
  const severityReason = otherIsWorse ? (other.severityReason ?? keeper.severityReason) : (keeper.severityReason ?? other.severityReason);
  const withCatalog = keeper.catalogId ? keeper : other.catalogId ? other : null;
  const fromSummary = keeper.fromSummary || other.fromSummary;
  // Proof survives a merge: prefer the verified quote from the report body.
  const quote = [keeper, other].find((t) => t.quote && !t.fromSummary)?.quote ?? keeper.quote ?? other.quote ?? null;
  const recurrence = keeper.recurrence ?? other.recurrence ?? null;

  if (detail(other) > detail(keeper)) Object.assign(keeper, other);

  keeper.sourcePage = bodyPage ?? anyPage ?? null;
  keeper.severity = severity;
  keeper.severityReason = severityReason ?? null;
  keeper.fromSummary = fromSummary;
  keeper.quote = quote;
  keeper.recurrence = recurrence;
  if (!keeper.catalogId && withCatalog) {
    keeper.catalogId = withCatalog.catalogId;
    keeper.costMin = withCatalog.costMin;
    keeper.costMax = withCatalog.costMax;
    keeper.costConfidence = withCatalog.costConfidence;
  }
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
        absorb(existing, t);
      }
      continue;
    }
    const key = `${t.catalogId}|${t.system ?? ''}`;
    const existing = byKey.get(key);
    if (!existing) { byKey.set(key, t); out.push(t); continue; }
    merged++;
    absorb(existing, t);
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
    const tok = defectTokens(t.title || '');
    let absorbedBy = -1;
    for (let i = 0; i < survivors.length; i++) {
      // The same inspector sentence quoted twice is one finding — even if the
      // model filed the copies under different systems or titles (BENI-69).
      if (quoteOverlap(t.quote, survivors[i].quote) >= 0.8) { absorbedBy = i; break; }
      if (isSplitFinding(t, survivors[i])) {
        // Keep the whole finding as proof: observation, then recommendation.
        const s = survivors[i];
        const [a, b] = s.quoteAt!.start <= t.quoteAt!.start ? [s, t] : [t, s];
        const joined = `${a.quote} ${b.quote}`;
        const span = { page: a.quoteAt!.page, start: a.quoteAt!.start, end: b.quoteAt!.end };
        absorb(s, t);
        s.quote = joined;
        s.quoteAt = span;
        fuzzyMerged++;
        absorbedBy = -2; // handled
        break;
      }
      const other = survivorTokens[i];
      // Near-identical titles are one finding even when the model filed the
      // copies under different systems ("Inspect garage roof after snow melt"
      // came back under both roof_attic and exterior).
      if (Math.min(tok.size, other.size) >= 3 && tokenOverlap(tok, other) >= 0.9) { absorbedBy = i; break; }
      if ((survivors[i].system ?? '') !== (t.system ?? '')) continue;
      if (tokenOverlap(tok, other) >= DUPLICATE_THRESHOLD || containment(tok, other) >= CONTAINMENT_THRESHOLD) {
        absorbedBy = i;
        break;
      }
    }
    if (absorbedBy === -1) {
      survivors.push(t);
      survivorTokens.push(tok);
    } else if (absorbedBy >= 0) {
      fuzzyMerged++;
      absorb(survivors[absorbedBy], t);
    }
    // absorbedBy === -2: a split finding, already folded in above.
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
/**
 * How many days after the INSPECTION a job should be done (BENI-70).
 *
 * The catalog's urgency window when we have one, severity otherwise. This is
 * only the window — scheduleTasks() turns it into a date measured from the
 * inspection, not from the day the report happened to be uploaded.
 */
function windowDaysFor(urgency: string | null | undefined, severity: string | null): number {
  const u = (urgency ?? '').toLowerCase();
  if (u.includes('immediate')) return 7;
  if (u.includes('30-90')) return 60;
  if (u.startsWith('before')) return 90;
  if (u.includes('1-2 year')) return 540;
  if (u.includes('annual') || u.includes('monitor')) return 365;
  return severity === 'critical' ? 30 : severity === 'minor' ? 365 : 180;
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
 * Some findings are critical because of what they ARE, not how urgent the
 * catalog says the repair is.
 *
 * The catalog derives severity from a repair's urgency window, which is the
 * right default but gets one class of finding badly wrong. A missing deck
 * handrail is not urgent in the sense of "the wood is deteriorating" — it is
 * urgent in the sense of "someone falls off the deck". Only 19 of 224 catalog
 * entries came out critical, and the first real user (a homeowner, not a
 * developer) immediately said leaks, electrical faults and safety hazards
 * should outrank cosmetic work.
 *
 * So: a deterministic override on top of the probabilistic result, the same
 * pattern as the 5x cost guard and the system keyword fallback. Three things
 * make a finding critical no matter what anything else concluded:
 *
 *   1. it can hurt somebody          (gas, CO, shock, fire, falls)
 *   2. water is actively getting in  (damage compounds every day it waits)
 *   3. the structure is moving       (cheap now, structural engineer later)
 *
 * The override only ever RAISES severity. It never demotes, because the
 * catalog and the model both have information this does not.
 */
const SAFETY_CRITICAL: [RegExp, string][] = [
  // Can hurt somebody
  [/\b(gas leak|smell of gas|natural gas leak|propane leak)\b/i, 'gas'],
  [/\b(carbon monoxide|co alarm|co detector)\b.*\b(missing|absent|none|not present|inoperative|expired)\b/i, 'CO'],
  [/\b(missing|no|absent|inoperative|expired)\b.*\b(smoke alarm|smoke detector|carbon monoxide)\b/i, 'alarms'],
  [/\b(exposed|open|live|energi[sz]ed)\b.*\b(wir|conductor|splice|junction|knockout|bus bar)/i, 'exposed wiring'],
  [/\b(double[- ]?tap|double[- ]?lug|federal pacific|stab[- ]?lok|zinsco|aluminum wiring|knob and tube)\b/i, 'panel hazard'],
  // "Melted" only near something electrical — the first live run flagged
  // "once the snow has melted off the roof" as a fire risk.
  [/\b(scorch|burn(ed|t)? mark|arcing|overheat)|\b(wire|wiring|insulation|outlet|receptacle|breaker|panel|cover plate)\b[^.]{0,30}\bmelted\b|\bmelted\b[^.]{0,30}\b(wire|wiring|insulation|outlet|receptacle|breaker|panel)\b/i, 'electrical heat'],
  [/\b(missing|no|absent|loose|inadequate)\b.*\b(handrail|guardrail|guard rail|railing|baluster)\b/i, 'fall hazard'],
  [/\b(trip hazard|fall hazard|safety hazard|fire hazard|shock hazard|electrocution)\b/i, 'stated hazard'],
  [/\bgfci\b.*\b(missing|absent|not present|required|no protection)\b/i, 'GFCI'],
  [/\b(cracked|failed|compromised)\b.*\b(heat exchanger|flue|chimney liner|vent connector)\b/i, 'combustion'],
  [/\b(back ?draft|spillage|improper venting|disconnected vent)\b/i, 'venting'],
  [/\b(garage door)\b.*\b(sensor|reverse|safety)\b.*\b(missing|not working|inoperative|fail)/i, 'door safety'],

  // Water actively getting in — the damage compounds daily
  [/\b(active|ongoing|current)\b.*\bleak/i, 'active leak'],
  [/\b(water (entry|entering|penetration|intrusion|ingress))\b/i, 'water intrusion'],
  [/\b(sewer backup|sewage|raw sewage)\b/i, 'sewage'],
  [/\b(mould|mold)\b.*\b(growth|visible|extensive|present)\b/i, 'mould'],
  // Must be a pipe that HAS burst, not advice about preventing one — the
  // looser version matched "check the main water shut-off valve".
  [/\b(pipe|line|hose)\b[^.]{0,30}\b(has |had |is )?(burst|split open|ruptured)\b/i, 'burst pipe'],

  // Structure moving
  [/\b(bowing|buckling|heaving|settling|shifting|displaced)\b.*\b(wall|foundation|beam|joist|footing)\b/i, 'movement'],
  [/\b(structural)\b.*\b(concern|defect|failure|damage|deficien)/i, 'structural'],
  // Rot only counts when it is in something holding weight up. "Deteriorated"
  // on its own appears in nearly every inspection report — fences, siding,
  // thresholds — and matching it produced 29 of 36 safety hits in testing,
  // which would have flooded the critical list with cosmetic work and taught
  // people to ignore the label entirely.
  [/\b(rot|rotten|rotting)\b[^.]{0,40}\b(joist|beam|post|column|ledger|sill|stair|step|deck(ing)?|structur|support|framing|truss|rafter)\b/i, 'structural rot'],
  [/\b(joist|beam|post|column|ledger|sill|stair|step|deck(ing)?|support|framing|truss|rafter)\b[^.]{0,40}\b(rot|rotten|rotting)\b/i, 'structural rot'],
];

/** What each trigger means to a homeowner — shown next to the severity. */
const HAZARD_REASON: Record<string, string> = {
  'gas': 'Gas leak — risk to people',
  'CO': 'Carbon monoxide protection missing',
  'alarms': 'Smoke or CO alarms missing or not working',
  'exposed wiring': 'Exposed wiring — shock and fire risk',
  'panel hazard': 'Known electrical panel hazard — fire risk',
  'electrical heat': 'Signs of overheating — fire risk',
  'fall hazard': 'Fall hazard',
  'stated hazard': 'The inspector calls it a hazard',
  'GFCI': 'Missing shock protection (GFCI)',
  'combustion': 'Combustion venting failure — CO risk',
  'venting': 'Improper venting — CO risk',
  'door safety': 'Garage door safety reverse not working',
  'active leak': 'Active leak — water damage and mould risk',
  'leak': 'Active leak — water damage and mould risk',
  'water intrusion': 'Water getting into the home',
  'sewage': 'Sewage problem — health risk',
  'mould': 'Mould — health risk and spreading damage',
  'burst pipe': 'Burst pipe — water damage',
  'movement': 'Structural movement',
  'structural': 'Structural concern',
  'structural rot': 'Rot in a part that holds weight',
  'urgent': 'The report says to do this as soon as possible',
  'sewer line': 'Main sewer line risk — very expensive if it fails',
};

/**
 * Founder's rule (2026-11-25): "Anything that's a leak, in my mind, is
 * critical." A leak the inspector OBSERVED — not advice to check for one.
 * "Check under sinks for leaks" and "no leaks noted" must not trip it.
 */
function isObservedLeak(text: string): boolean {
  // A WATER leak, in the same sentence as something that carries water.
  // First live run: "current leakage" (a GFCI finding) and "warm air leaking"
  // (a disconnected dryer vent) both came out as "active leak".
  const WATERY = '(water|drain|pipe|plumbing|faucet|sink|toilet|tub|shower|tank|heater|roof|supply line|valve|fitting|trap|hose|ceiling|ice dam)';
  const near = new RegExp(`\\b${WATERY}\\b[^.]{0,50}\\bleak(s|ing|age|ed)?\\b|\\bleak(s|ing|age|ed)?\\b[^.]{0,50}\\b${WATERY}\\b`, 'i');
  if (!near.test(text)) return false;
  if (/\b(air|current|gas)\s+leak/i.test(text) && !/\bwater\b[^.]{0,30}\bleak|\bleak\w*\b[^.]{0,30}\bwater\b/i.test(text)) return false;
  if (/\b(no|without)\s+(visible\s+|active\s+|signs? of\s+)?leak/i.test(text)) return false;
  if (/\b(check|inspect|monitor|test|look|watch|leak detection|smart water)\w*\b[^.]{0,25}\bleak/i.test(text)) return false;
  return true;
}

/**
 * Returns the reason this finding is critical, or null.
 * Matches on the inspector's quote as well as our fields — the dangerous part
 * is in the inspector's sentence more often than in any title.
 */
function safetyReason(task: ExtractedTask): string | null {
  // Judge on what the INSPECTOR said. When we have his verified words, use
  // only those and the title: `issue` is often the cost catalog's generic
  // homeowner text — on the founder's report a tree-trimming row ("Roots can
  // also reach the sewer line") made "trim branches near the electrical
  // service" critical for a sewer risk the inspector never mentioned.
  const text = (task.quote
    ? [task.quote, task.title]
    : [task.title, task.issue, task.fixRecommendation, task.location]
  ).filter(Boolean).join(' ');

  // The hazard has to be in what the inspector OBSERVED, not in the
  // consequence he is warning about. "Repair the stucco to prevent water
  // intrusion" is preventive advice (moderate, per the founder's rubric);
  // "water is entering at the window" is critical. Tested on the founder's own
  // report: without this, the stucco finding came out critical.
  // Consequence language ("...can cause rot", "...which may lead to water
  // intrusion") describes what COULD happen; strip it before testing.
  const observed = text.replace(
    /\b(to\s+)?(prevent|avoid|reduce|minimi[sz]e|possible|potential|risk of|could|may|can|might|will|would|lead(s)? to|result(s)? in|cause[sd]?)\b[^.]{0,70}/gi,
    ' ',
  );

  if (/\b(as soon as possible|asap|immediately|immediate (attention|repair)|urgent(ly)?)\b/i.test(text)) {
    return HAZARD_REASON.urgent;
  }
  // A leak first: it is the most specific reason ("mould" is its consequence).
  if (isObservedLeak(observed)) return HAZARD_REASON.leak;
  for (const [rx, label] of SAFETY_CRITICAL) {
    if (rx.test(observed)) return HAZARD_REASON[label] ?? label;
  }
  // "Tree roots COULD grow into the main drain" is still the founder's
  // textbook critical — the risk itself is the finding — so test the full text.
  // Tree roots only count when a drain or sewer is in the same finding: the
  // first live run flagged "trim the trees near the electrical service".
  if (/\b(main (drain|sewer|waste|line)|sewer (line|lateral)|main line plumbing|waste line)\b/i.test(text) ||
      (/\btree roots?\b/i.test(text) && /\b(drain|sewer|waste line|main line)\b/i.test(text))) {
    return HAZARD_REASON['sewer line'];
  }
  return null;
}

const rankOf = (s: string | null | undefined) => SEVERITY_RANK[s ?? ''] ?? 0;

/**
 * Apply the safety triggers LAST, after every other source has had its say.
 *
 * It used to run before the catalog merge, and the merge then overwrote the
 * severity with the catalog's — so a leak the rule had just raised to
 * critical was put back to moderate whenever it matched a catalog entry. The
 * founder spotted exactly that on his own report. Only ever raises.
 */
function applySafety(t: ExtractedTask): ExtractedTask {
  const hazard = safetyReason(t);
  if (!hazard) return t;
  if (t.severity !== 'critical') {
    console.log(`Raised "${t.title}" to critical (${hazard}).`);
    return { ...t, severity: 'critical', severityReason: hazard, safetyReason: hazard };
  }
  return { ...t, safetyReason: hazard, severityReason: t.severityReason ?? hazard };
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
        fromSummary: t.fromSummary === true,
        quote: str(t.quote),
        severityReason: str(t.severityReason),
        dueWindowDays: null,
      };

      // Never leave a task uncategorised - it would vanish from the score.
      if (!base.system) base.system = inferSystem(t);

      if (!match) {
        base.dueWindowDays = windowDaysFor(null, base.severity);
        return applySafety(base);
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
        base.catalogId = null;
        base.dueWindowDays = windowDaysFor(null, base.severity);
        return applySafety(base);
      }

      // The catalog's severity can RAISE the inspector-based judgement, never
      // lower it: the model applied the founder's rubric to the inspector's
      // own words, and a generic catalog row should not talk a leak down.
      const catalogSeverity = (SEVERITIES as readonly string[]).includes(String(match.severity))
        ? (match.severity as ExtractedTask['severity'])
        : null;
      const raisedByCatalog = rankOf(catalogSeverity) > rankOf(base.severity);

      // Researched catalog values win over the model's guesses for COST.
      return applySafety({
        ...base,
        system: (HOME_SYSTEMS as readonly string[]).includes(match.system)
          ? (match.system as ExtractedTask['system'])
          : base.system,
        severity: raisedByCatalog ? catalogSeverity : base.severity,
        severityReason: raisedByCatalog && match.urgency
          ? `Typical timeframe for this repair: ${match.urgency}`
          : base.severityReason,
        costMin: match.cost_low ?? base.costMin,
        costMax: match.cost_high ?? base.costMax,
        location: base.location ?? match.location,
        // The catalog's homeowner-language wording beats a paraphrase of jargon.
        issue: match.meaning ?? base.issue,
        costConfidence: match.confidence ?? null,
        timingNote: base.timingNote ?? (match.urgency ? `Typical timeframe: ${match.urgency}` : null),
        dueWindowDays: windowDaysFor(match.urgency, raisedByCatalog ? catalogSeverity : base.severity),
      });
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

    // WHO is asking, and is it THEIR report? (BENI-74)
    //
    // verify_jwt only proves the request carries a valid Supabase token — and
    // the public anon key IS one. Combined with the service-role download
    // below, anyone holding the app's public key could ask for any user's
    // report by path. Found while preparing for a partner's technical review
    // (2026-11-25). Now the caller must be a signed-in user, and every upload
    // lives under `<their user id>/...`, so the path must start with theirs.
    const authHeader = req.headers.get('Authorization') ?? '';
    const asCaller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: auth } = await asCaller.auth.getUser();
    if (!auth?.user) {
      return new Response(JSON.stringify({ error: 'Please sign in again to process a report.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!String(filePath).startsWith(`${auth.user.id}/`)) {
      console.error(`Refused: user ${auth.user.id} asked for a file outside their folder.`);
      return new Response(JSON.stringify({ error: 'That report does not belong to this account.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Service-role client: needed to read the private user_files bucket —
    // only reached once the caller is known to own the file.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const t0 = Date.now();
    const mark = (label: string, since: number) =>
      console.log(`TIMING ${label}: ${Date.now() - since}ms`);

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

    mark('download+catalog', t0);
    const tPdf = Date.now();
    const pdfBytes = new Uint8Array(await fileBlob.arrayBuffer());
    const rawPages = await extractPdfPages(pdfBytes);
    const report = preparePdfText(rawPages);
    mark('pdf parse', tPdf);
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
    const tExtract = Date.now();
    const findings = await extractFindings(report, description);
    mark('stage1 extract (parallel LLM)', tExtract);

    const tMatch = Date.now();
    await matchFindings(findings, catalogText);
    mark('stage2 catalog match (single LLM)', tMatch);
    const deduped = mergeSameCatalogEntry(findings);
    const tasks = sanitizeAndEnrich(deduped, catalog);

    // Turn "replace the filters routinely" into "Every 3 months" by borrowing
    // the cadence from the recurring bank.
    const { data: bankRows } = await supabase
      .from('standard_tasks')
      .select('title, recur_frequency, recur_interval');
    const adopted = adoptCadence(tasks, bankRows ?? []);
    if (adopted > 0) console.log(`Gave ${adopted} routine finding(s) a real cadence from the bank.`);

    // Every date is measured from the day the home was inspected, not the day
    // the PDF happened to be uploaded (BENI-70).
    const inspection = findInspectionDate(report.pages);
    console.log(
      inspection
        ? `Inspection date ${inspection.date} (page ${inspection.page}).`
        : 'No labelled inspection date found — the homeowner will be asked.',
    );
    scheduleTasks(tasks, inspection?.date ?? null);

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
      `kinds=${JSON.stringify(kinds)}, fromSummary=${tasks.filter((t) => t.fromSummary).length}. ` +
      `catalog_size=${catalog.size}`,
    );

    mark('TOTAL', t0);
    const critical = tasks.filter((t) => t.severity === 'critical').length;
    const quoted = tasks.filter((t) => t.quote).length;
    console.log(`Severity: ${critical} critical. Proof: ${quoted}/${tasks.length} tasks carry a verified quote.`);

    return new Response(JSON.stringify({
      tasks,
      inspectionDate: inspection?.date ?? null,
      inspectionDatePage: inspection?.page ?? null,
    }), {
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
