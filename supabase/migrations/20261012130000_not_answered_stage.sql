-- =============================================================================
-- New lead stage: "Not Answered" (the call was not picked up).
-- =============================================================================
--
-- A normal (non-green) stage. The green list used by the green_since trigger
-- is unchanged. Keep LEAD_STATUSES in src/lib/types.ts in sync.
-- =============================================================================

alter table public.leads drop constraint leads_status_check;
alter table public.leads add constraint leads_status_check check (status in (
  'New', 'Not Answered', 'Contacted', 'Interested', 'Not Sure', 'High Priority',
  'Qualified', 'Proposal Sent', 'Negotiation', 'Won', 'Lost'));
