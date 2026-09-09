-- APPLIED 2026-09-08.
--
-- Records which page of the source inspection PDF a finding came from, so the
-- dashboard can offer "View in report" and open the PDF at that page.
--
-- The value is computed deterministically during extraction: the Edge Function
-- keeps the PDF's pages separate, notes the character offset each page starts
-- at, and looks up the page for the chunk a finding was read from. The model is
-- never asked for a page number, so this column cannot hold a hallucinated one.
--
-- Nullable on purpose: a finding whose page cannot be established confidently
-- keeps NULL, and the UI simply hides the link rather than sending the reader
-- to the wrong page.

alter table public.tasks
  add column if not exists source_page integer;

comment on column public.tasks.source_page is
  'Page of the source inspection PDF this finding came from (1-based). Computed from page offsets during extraction, never asked of the LLM.';
