/**
 * Trusted pros (BENI-73) — the start of the contractor pipeline.
 *
 * When the inspector writes "recommend repair by a qualified plumber", the
 * task shows the plumbers BENi works with. Listings live in the `contractors`
 * table and are added by hand in the Supabase dashboard once a contractor has
 * agreed to be listed. Until then the card shows an honest "coming soon".
 */
import { supabase } from '@/services/supabase';

export type Trade =
  | 'roofer' | 'plumber' | 'electrician' | 'hvac' | 'general' | 'foundation'
  | 'asbestos' | 'pest' | 'chimney' | 'window' | 'landscaping';

export type Contractor = {
  id: string;
  name: string;
  trade: Trade;
  phone: string | null;
  website: string | null;
  service_area: string | null;
  note: string | null;
};

export const TRADE_LABEL: Record<Trade, { one: string; many: string }> = {
  roofer:      { one: 'roofer',            many: 'roofers' },
  plumber:     { one: 'plumber',           many: 'plumbers' },
  electrician: { one: 'electrician',       many: 'electricians' },
  hvac:        { one: 'HVAC technician',   many: 'HVAC technicians' },
  general:     { one: 'contractor',        many: 'contractors' },
  foundation:  { one: 'foundation specialist', many: 'foundation specialists' },
  asbestos:    { one: 'asbestos contractor', many: 'asbestos contractors' },
  pest:        { one: 'pest control company', many: 'pest control companies' },
  chimney:     { one: 'chimney sweep',     many: 'chimney sweeps' },
  window:      { one: 'window installer',  many: 'window installers' },
  landscaping: { one: 'arborist or landscaper', many: 'arborists and landscapers' },
};

/** Does the inspector want a professional for this? Then show the pros. */
export function wantsAPro(text: string): boolean {
  return /\b(qualified|licensed|certified|contractor|plumber|electrician|roofer|roofing|technician|arborist|landscaper|specialist|professional|engineer|wett|sweep)\b/i.test(text);
}

/** Which trade the finding calls for — the inspector's own word wins. */
export function tradeFor(text: string, system?: string | null): Trade {
  const t = text.toLowerCase();
  if (/asbestos/.test(t)) return 'asbestos';
  if (/\b(arborist|landscap|tree|branch|vegetation|grading|slope)/.test(t)) return 'landscaping';
  if (/\b(chimney|fireplace|wett|wood stove)/.test(t)) return 'chimney';
  if (/\b(electric|wiring|outlet|receptacle|gfci|breaker|junction|subpanel|panel)/.test(t)) return 'electrician';
  if (/\b(plumb|drain|sewer|pipe|faucet|toilet|sink|tub|shower|water heater|hot water tank|hose bib)/.test(t)) return 'plumber';
  if (/\b(roof|shingle|gutter|eavestrough|downspout|flashing|soffit)/.test(t)) return 'roofer';
  if (/\b(furnace|hvac|duct|dryer vent|humidifier|air condition|heat pump|hrv)/.test(t)) return 'hvac';
  if (/\b(foundation|structural|joist|beam|engineer)/.test(t)) return 'foundation';
  if (/\b(window|glazing)/.test(t)) return 'window';
  if (/\b(pest|rodent|mice|insect)/.test(t)) return 'pest';
  switch (system) {
    case 'plumbing': return 'plumber';
    case 'electrical': return 'electrician';
    case 'roof_attic': return 'roofer';
    case 'hvac': return 'hvac';
    default: return 'general';
  }
}

const cache = new Map<Trade, Promise<Contractor[]>>();

/** Active listings for a trade. Cached for the session — one query per trade. */
export function fetchContractors(trade: Trade): Promise<Contractor[]> {
  if (!cache.has(trade)) {
    cache.set(trade, (async () => {
      const { data, error } = await supabase
        .from('contractors')
        .select('id, name, trade, phone, website, service_area, note')
        .eq('trade', trade)
        .eq('active', true)
        .limit(3);
      if (error) { console.error('contractors lookup failed:', error.message); return []; }
      return (data ?? []) as Contractor[];
    })());
  }
  return cache.get(trade)!;
}
