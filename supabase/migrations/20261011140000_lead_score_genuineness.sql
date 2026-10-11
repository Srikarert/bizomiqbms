-- =============================================================================
-- Lead score and genuineness (from the "Lead Score" / "Genuineness" columns of
-- the lead-research spreadsheets).
-- =============================================================================
--
--   lead_score   0-100, higher = better lead. NULL = not scored.
--   genuineness  'High' | 'Medium' | 'Low': how likely the business is real
--                and reachable. NULL = unknown.
-- Keep GENUINENESS_LEVELS in src/lib/types.ts in sync.
-- =============================================================================

alter table public.leads
  add column lead_score  integer check (lead_score between 0 and 100),
  add column genuineness text    check (genuineness in ('High', 'Medium', 'Low'));
