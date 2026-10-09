-- =============================================================================
-- Leads: alternate phone + raw call status from spreadsheets.
-- =============================================================================
--
-- call_status keeps the remark exactly as written in the sheet ("busy",
-- "visit", "Monday mrng 11am"). status is the pipeline stage derived from it.
-- Green leads = status in (Interested, Qualified, Proposal Sent, Negotiation, Won).
--
-- The derivation rules mirror deriveLeadStatus() in src/features/leads/status.ts.
-- =============================================================================

alter table public.leads
  add column alternate_phone text,
  add column call_status     text;

-- The reconcile migration stored the original sheet status as a
-- "Call status: <text>" line in notes. Move it to call_status.
update public.leads
set call_status = btrim(substring(notes from 'Call status: ([^\n]*)')),
    notes       = nullif(btrim(regexp_replace(notes, '\n?Call status: [^\n]*', '', 'g')), '')
where notes ~ 'Call status: ';

-- Re-derive the stage. "visit" was filed under Contacted; it is interest.
update public.leads
set status = case
  when lower(call_status) ~ '(not\s*req|not\s*interest|no\s*need|wrong\s*(no|num)|not\s*required)' then 'Lost'
  when lower(call_status) ~ '(visit|interest|meeting|demo|quot|proposal|deal|confirm)'              then 'Interested'
  else 'Contacted'
end
where call_status is not null and call_status <> '';
