-- =============================================================================
-- Visits: in-person visits to a lead, shown on a calendar.
-- =============================================================================
--
-- One row per planned visit. owner is the team member going ("Handled by").
-- Deleting a lead removes its visits (same as follow-ups).
-- Access: team members only; anon has no access.
-- =============================================================================

create table public.visits (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads (id) on delete cascade,
  visit_date date not null,
  visit_time text check (visit_time is null or visit_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  address    text,
  notes      text,
  owner      text check (owner in ('Srikar', 'Nikhil', 'Jethin')),
  status     text not null default 'Scheduled' check (status in ('Scheduled', 'Completed', 'Cancelled')),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index visits_visit_date_idx on public.visits (visit_date);
create index visits_lead_id_idx    on public.visits (lead_id);
create index visits_owner_idx      on public.visits (owner);
create index visits_created_by_idx on public.visits (created_by);

create trigger visits_set_updated_at
  before update on public.visits
  for each row execute function public.set_updated_at();

revoke all on public.visits from anon, authenticated;
grant select, insert, update, delete on public.visits to authenticated;

alter table public.visits enable row level security;

create policy "visits: team members can read"
  on public.visits for select to authenticated using ((select public.is_team_member()));
create policy "visits: team members can insert"
  on public.visits for insert to authenticated with check ((select public.is_team_member()));
create policy "visits: team members can update"
  on public.visits for update to authenticated
  using ((select public.is_team_member())) with check ((select public.is_team_member()));
create policy "visits: team members can delete"
  on public.visits for delete to authenticated using ((select public.is_team_member()));
