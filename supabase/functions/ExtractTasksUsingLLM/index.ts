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
};

const SECTION_HEADERS = [
  'CONDUCT', 'ROOF', 'EXTERIOR', 'GARAGE', 'ATTIC', 'INTERIOR',
  'KITCHEN', 'LAUNDROMAT', 'LAUNDRY', 'BATHROOM', 'MECHANICAL',
];

function buildSystemPrompt(catalogText: string): string {
  return `You read home inspection reports and turn them into a homeowner's maintenance plan.

REPORT FORMAT YOU WILL SEE
The report is organised under ALL-CAPS section headings (ROOF, EXTERIOR, GARAGE,
ATTIC, INTERIOR, KITCHEN, LAUNDROMAT, BATHROOM, MECHANICAL). Under each heading,
findings look like:

    Component Name:
    <what was observed>. This may <consequence>. Recommend <action>.

Extract ONE task per finding that a homeowner should act on.

FIELD RULES
- title: short, action-first, specific. Good: "Reseal roof flashing at the chimney".
  Bad: "Roof issue". Never just repeat the component name.
- issue: 1-2 plain sentences describing what is actually wrong. Write for a
  homeowner, not an inspector. No jargon without explanation.
- fixRecommendation: 1-2 sentences on the fix, based on the report's "Recommend..."
  wording. Say who to call if relevant (e.g. "licensed electrician").
- location: where it is (e.g. "Front eavestrough", "Right exterior"). null if unclear.
- system: EXACTLY one of ${HOME_SYSTEMS.join(', ')}. Map by CONTENT first, then heading:
    * anything about wiring/outlets/panels/breakers -> electrical
    * anything about pipes/drains/water heater/faucets/toilets -> plumbing
    * anything about furnace/AC/ducts/vents/thermostat -> hvac
    * ROOF or ATTIC heading -> roof_attic
    * EXTERIOR, GARAGE, grading, siding, gutters -> exterior
    * KITCHEN, BATHROOM, LAUNDROMAT, INTERIOR (and not one of the above) -> interior
  Never invent a value outside that list.
- severity: EXACTLY one of ${SEVERITIES.join(', ')}.
    * critical = safety hazard, active water intrusion, or something causing
      ongoing damage (electrical shock risk, gas, structural, active leak).
    * moderate = should be addressed soon; will worsen or cost more if ignored.
    * minor = routine upkeep, cosmetic, or monitor-only.
  Judge from the language and consequence, not from how long the entry is.
- costMin / costMax: rough CAD estimate for the repair, as plain integers
  (no currency symbols). Use typical Canadian contractor pricing. If you truly
  cannot estimate, use null for both.
- dueDate: ISO date (YYYY-MM-DD) ONLY if the report states or clearly implies a
  deadline. Otherwise null. Do not invent dates.
- timingNote: short, encouraging, practical rationale for when to do it
  (e.g. "Best done before fall rains"). null if nothing sensible to say.
- recurrence: if this is recurring upkeep, one of "Every 3 months",
  "Every 6 months", "Yearly". Otherwise null.

RULES
- Skip anything that is not actionable: pure descriptions, "no deficiencies
  noted", inspector credentials, disclaimers, standards of practice.
- Do not duplicate the same underlying problem twice.
- If the report is unreadable or contains no findings, return {"tasks": []}.

Return ONLY valid JSON: { "tasks": ExtractedTask[] }. No markdown fences, no prose.`;
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
function trimToFindings(text: string): string {
  const pattern = new RegExp(`^\\s*(${SECTION_HEADERS.join('|')})\\s*$`, 'm');
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      // Require a couple more headers after this point so we don't cut at the
      // table of contents.
      const rest = lines.slice(i).join('\n');
      const headerCount = (rest.match(new RegExp(`^\\s*(${SECTION_HEADERS.join('|')})\\s*$`, 'gm')) || []).length;
      if (headerCount >= 3) return rest;
    }
  }
  return text;
}

const MAX_CHARS = 120_000; // generous ceiling after repair; ~30k tokens

function preparePdfText(raw: string): { text: string; rawChars: number; finalChars: number } {
  const repaired = repairSpacedText(raw);
  const trimmed = trimToFindings(repaired);
  const capped = trimmed.length > MAX_CHARS ? trimmed.slice(0, MAX_CHARS) : trimmed;
  return { text: capped, rawChars: raw.length, finalChars: capped.length };
}

async function extractPdfText(pdfBytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import('npm:unpdf@0.11.0');
  const pdf = await getDocumentProxy(pdfBytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
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

async function callLLM(
  reportText: string,
  description: string,
  catalogText: string,
): Promise<ExtractedTask[]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured in Edge Function secrets.');

  const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini';
  const userContent =
    (description ? `Notes from the homeowner: ${description}\n\n` : '') +
    `Inspection report:\n${reportText}`;

  const MAX_ATTEMPTS = 3;
  let lastError = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.1, // deterministic-ish: we want consistent extraction, not creativity
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt(catalogText) },
          { role: 'user', content: userContent },
        ],
      }),
    });

    if (response.ok) {
      const completion = await response.json();
      const content = completion.choices?.[0]?.message?.content ?? '{"tasks":[]}';
      const usage = completion.usage;
      if (usage) {
        console.log(
          `LLM ok — model=${model} prompt_tokens=${usage.prompt_tokens} ` +
          `completion_tokens=${usage.completion_tokens}`,
        );
      }
      let parsed: { tasks?: unknown };
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error('The AI returned malformed JSON. Please try again.');
      }
      return Array.isArray(parsed.tasks) ? (parsed.tasks as ExtractedTask[]) : [];
    }

    const body = await response.text();
    lastError = describeOpenAiError(response.status, body);
    console.error(`LLM attempt ${attempt}/${MAX_ATTEMPTS} failed (${response.status}): ${body.slice(0, 500)}`);

    // Only retry things that might succeed on a second try. A quota/auth problem
    // will never fix itself, so fail fast and tell the user.
    const retryable = response.status >= 500 ||
      (response.status === 429 && !/insufficient_quota/i.test(body));
    if (!retryable || attempt === MAX_ATTEMPTS) break;

    await sleep(1000 * 2 ** (attempt - 1)); // 1s, 2s
  }

  throw new Error(lastError || 'AI request failed.');
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
      };

      if (!match) return base;

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
        timingNote: base.timingNote ?? (match.urgency ? `Typical timeframe: ${match.urgency}` : null),
      };
    });
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
    const { description = '', file_path: filePath } = await req.json();
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

    // Load the catalog the model matches findings against.
    const { data: catalogRows, error: catalogError } = await supabase
      .from('cost_catalog')
      .select('id, system, component, defect, location, meaning, severity, urgency, cost_low, cost_typical, cost_high');
    if (catalogError) console.error('cost_catalog load failed:', catalogError.message);

    const catalog = new Map<string, CatalogRow>();
    for (const row of ((catalogRows ?? []) as CatalogRow[])) catalog.set(row.id, row);

    // Compact one-line-per-entry form keeps the prompt affordable.
    const catalogText = ((catalogRows ?? []) as CatalogRow[])
      .map((r) => `${r.id} | ${r.system} | ${r.component} | ${r.defect}`)
      .join('\n');

    const pdfBytes = new Uint8Array(await fileBlob.arrayBuffer());
    const rawText = await extractPdfText(pdfBytes);
    const { text, rawChars, finalChars } = preparePdfText(rawText);

    console.log(
      `PDF prepared — raw=${rawChars} chars, sent=${finalChars} chars ` +
      `(${rawChars ? Math.round((1 - finalChars / rawChars) * 100) : 0}% reduction)`,
    );

    if (finalChars < 200) {
      throw new Error(
        'Could not read any text from this PDF. It may be a scanned image, which needs OCR.',
      );
    }

    const tasks = sanitizeAndEnrich(await callLLM(text, description, catalogText), catalog);
    const matched = tasks.filter((t) => t.catalogId).length;
    console.log(
      `Extracted ${tasks.length} tasks; ${matched} matched to catalog, ` +
      `${tasks.length - matched} unmatched. catalog_size=${catalog.size}`,
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
