-- APPLIED 2026-09-10.
--
-- Carries the cost catalog's own confidence rating onto each task, so the app
-- can say how much to trust a price instead of printing a bare dollar range.
--
-- This matters because the catalog is honest about its own uncertainty: of 224
-- entries, 72 are High confidence, 151 Medium and 1 Low. A homeowner reading
-- "$4,000 - $9,000" has no way to tell a well-researched Calgary range from an
-- order-of-magnitude guide unless we tell them.
--
-- NULL means the finding matched no catalog entry at all -- the figure is then
-- the model's own estimate, which the UI labels most cautiously of all.

alter table public.tasks
  add column if not exists cost_confidence text;

comment on column public.tasks.cost_confidence is
  'Confidence of the matched cost_catalog estimate (High/Medium/Low). Surfaced so a homeowner never mistakes a planning range for a quote.';

update public.tasks t
set cost_confidence = c.confidence
from public.cost_catalog c
where t.catalog_id = c.id and t.cost_confidence is null;
