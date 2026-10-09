-- =============================================================================
-- Lead categories (Constructions, Interiors, Events, ...): one per lead.
-- =============================================================================
--
-- Team-managed list. Deleting a category leaves its leads uncategorized.
-- New table: no anon access (unlike the legacy tables, see reconcile migration).
-- =============================================================================

create table public.lead_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now()
);

-- Case-insensitive uniqueness: "Events" and "events" are the same category.
create unique index lead_categories_name_key on public.lead_categories (lower(btrim(name)));

alter table public.leads
  add column category_id uuid references public.lead_categories (id) on delete set null;

create index leads_category_id_idx on public.leads (category_id);

revoke all on public.lead_categories from anon, authenticated;
grant select, insert, update, delete on public.lead_categories to authenticated;

alter table public.lead_categories enable row level security;

create policy "lead_categories: team members can read"
  on public.lead_categories for select to authenticated using ((select public.is_team_member()));
create policy "lead_categories: team members can insert"
  on public.lead_categories for insert to authenticated with check ((select public.is_team_member()));
create policy "lead_categories: team members can update"
  on public.lead_categories for update to authenticated
  using ((select public.is_team_member())) with check ((select public.is_team_member()));
create policy "lead_categories: team members can delete"
  on public.lead_categories for delete to authenticated using ((select public.is_team_member()));

-- Starter categories. The 33 leads imported on 2026-10-08 are all event companies.
insert into public.lead_categories (name) values ('Constructions'), ('Interiors'), ('Events');

update public.leads
set category_id = (select id from public.lead_categories where name = 'Events')
where category_id is null;
