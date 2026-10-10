-- =============================================================================
-- Lead priority marker: 'High' (shown blue) or 'Maybe' (shown yellow,
-- "maybe or maybe not"). NULL = no priority. Independent of the stage, so a
-- lead can be both green and high priority.
-- =============================================================================

alter table public.leads
  add column priority text check (priority in ('High', 'Maybe'));

create index leads_priority_idx on public.leads (priority) where priority is not null;
