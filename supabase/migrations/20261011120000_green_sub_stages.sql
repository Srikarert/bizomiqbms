-- =============================================================================
-- Green lead sub-stages: "Not Sure" (yellow) and "High Priority" (blue).
-- =============================================================================
--
-- The team wanted these as stages, not as a separate priority field. The
-- leads.priority column from 20261010140000_lead_priority.sql is no longer
-- used by the app (all NULL); it is left in place and can be dropped later:
--   drop index if exists public.leads_priority_idx;
--   alter table public.leads drop column priority;
--
-- Green leads = Interested, Not Sure, High Priority, Qualified, Proposal Sent,
-- Negotiation, Won. In the Green tab they split into Normal / Not sure / High
-- priority. Keep in sync with LEAD_STATUSES / GREEN_STATUSES in the frontend.
-- =============================================================================

alter table public.leads drop constraint leads_status_check;
alter table public.leads add constraint leads_status_check check (status in (
  'New', 'Contacted', 'Interested', 'Not Sure', 'High Priority',
  'Qualified', 'Proposal Sent', 'Negotiation', 'Won', 'Lost'));
