-- =============================================================================
-- Bizomiq BMS — reconcile existing schema (init_bms_schema, 2026-10-08) with
-- the CRM app.
-- =============================================================================
--
-- The project already had tables and live data (33 imported leads). This
-- migration is ADDITIVE: no table/column is renamed or dropped, so any other
-- client still using the old schema keeps working.
--
-- What it does
--   * team_members allowlist + is_team_member() helper.
--   * import_templates (saved spreadsheet column mappings).
--   * leads: normalizes free-text call statuses into the fixed pipeline (the
--     original text is preserved in notes), adds CHECKs, generated
--     email/phone_normalized columns for import dedupe, lead -> client link.
--   * followups: updated_at + trigger, "exactly one of lead/client" CHECK.
--   * CHECKs on priorities, budgets, dates; missing FK indexes.
--   * set_updated_at(): pinned search_path.
--   * RLS: replaces the "Allow auth all" policies with team-member policies.
--
-- KNOWN GAP (deliberate, pending decision): the "Allow anon all on <table>"
-- policies are left in place because another client may still depend on
-- them. Until they are dropped, anyone with the publishable key can read and
-- write CRM data. Removal:  drop policy "Allow anon all on leads" on public.leads; ...
--
-- Admin bootstrap (run once in the SQL editor after creating the auth user):
--   insert into public.team_members (user_id, email, role)
--   select id, email, 'admin' from auth.users where email = 'srikarakula123@gmail.com';
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- team_members
-- -----------------------------------------------------------------------------

create table public.team_members (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  role       text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

comment on table public.team_members is
  'Allowlist of auth users permitted to access CRM data. Managed by admins via SQL.';

-- SECURITY INVOKER: relies on the "read own row" policy, so it only ever
-- reveals whether the *calling* user is a member.
create or replace function public.is_team_member()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members where user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_team_member() from public, anon;
grant execute on function public.is_team_member() to authenticated;

-- -----------------------------------------------------------------------------
-- leads
-- -----------------------------------------------------------------------------

-- Imported rows carry call outcomes in status ("busy", "not req", ...). Keep
-- the original text in notes, then map onto the pipeline.
update public.leads
set notes  = concat_ws(E'\n', nullif(notes, ''), 'Call status: ' || btrim(status)),
    status = case
               when lower(btrim(status)) in ('not req', 'not required', 'not interested') then 'Lost'
               else 'Contacted'
             end
where btrim(coalesce(status, '')) <> ''
  and status not in ('New', 'Contacted', 'Interested', 'Qualified',
                     'Proposal Sent', 'Negotiation', 'Won', 'Lost');

update public.leads set status = 'New' where btrim(coalesce(status, '')) = '';

alter table public.leads
  add constraint leads_status_check check (status in (
    'New', 'Contacted', 'Interested', 'Qualified',
    'Proposal Sent', 'Negotiation', 'Won', 'Lost')),
  add constraint leads_company_name_check check (length(btrim(company_name)) > 0),
  add constraint leads_deal_value_check check (deal_value >= 0),
  add column email_normalized text
    generated always as (nullif(lower(btrim(email)), '')) stored,
  add column phone_normalized text
    generated always as (nullif(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), '')) stored;

create index leads_created_at_idx    on public.leads (created_at desc);
create index leads_email_norm_idx    on public.leads (email_normalized) where email_normalized is not null;
create index leads_phone_norm_idx    on public.leads (phone_normalized) where phone_normalized is not null;
create index leads_company_lower_idx on public.leads (lower(company_name));

-- -----------------------------------------------------------------------------
-- tags / lead_tags
-- -----------------------------------------------------------------------------

alter table public.tags
  add constraint tags_name_check check (length(btrim(name)) > 0);

create index lead_tags_tag_id_idx on public.lead_tags (tag_id);

-- -----------------------------------------------------------------------------
-- clients
-- -----------------------------------------------------------------------------

alter table public.clients
  add constraint clients_company_name_check check (length(btrim(company_name)) > 0),
  add column lead_id uuid references public.leads (id) on delete set null;

create index clients_lead_id_idx on public.clients (lead_id);

-- -----------------------------------------------------------------------------
-- projects
-- -----------------------------------------------------------------------------

alter table public.projects
  add constraint projects_name_check check (length(btrim(name)) > 0),
  add constraint projects_priority_check check (priority in ('Low', 'Medium', 'High', 'Urgent')),
  add constraint projects_budget_check check (budget >= 0),
  add constraint projects_dates_check check (deadline is null or start_date is null or deadline >= start_date);

-- -----------------------------------------------------------------------------
-- tasks
-- -----------------------------------------------------------------------------

alter table public.tasks
  add constraint tasks_title_check check (length(btrim(title)) > 0),
  add constraint tasks_priority_check check (priority in ('Low', 'Medium', 'High', 'Urgent'));

create index tasks_status_due_idx on public.tasks (status, due_date);

-- -----------------------------------------------------------------------------
-- followups
-- -----------------------------------------------------------------------------

alter table public.followups
  add column updated_at timestamptz not null default now(),
  -- Each follow-up belongs to exactly one lead or one client.
  add constraint followups_target_check check (num_nonnulls(lead_id, client_id) = 1);

create index followups_pending_idx on public.followups (date) where status = 'Pending';

create trigger tr_followups_updated_at
  before update on public.followups
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- import_templates
-- -----------------------------------------------------------------------------

create table public.import_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) > 0),
  entity     text not null default 'leads' check (entity in ('leads')),
  -- { "<normalized spreadsheet header>": "<lead field>" | null (ignored) }
  mapping    jsonb not null default '{}'::jsonb check (jsonb_typeof(mapping) = 'object'),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity, name)
);

create index import_templates_created_by_idx on public.import_templates (created_by);

create trigger tr_import_templates_updated_at
  before update on public.import_templates
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Privileges for the new tables (anon gets nothing)
-- -----------------------------------------------------------------------------

revoke all on public.team_members, public.import_templates from anon, authenticated;
grant select on public.team_members to authenticated;
grant select, insert, update, delete on public.import_templates to authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.team_members     enable row level security;
alter table public.import_templates enable row level security;

create policy "team_members: read own row"
  on public.team_members for select
  to authenticated
  using (user_id = (select auth.uid()));

do $$
declare
  t text;
begin
  foreach t in array array['leads', 'clients', 'projects', 'tasks', 'followups',
                           'activities', 'tags', 'lead_tags', 'import_templates']
  loop
    -- Signed in is not enough: replace the blanket authenticated policy.
    execute format('drop policy if exists %I on public.%I', 'Allow auth all on ' || t, t);

    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.is_team_member()))',
      t || ': team members can read', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select public.is_team_member()))',
      t || ': team members can insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.is_team_member())) with check ((select public.is_team_member()))',
      t || ': team members can update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select public.is_team_member()))',
      t || ': team members can delete', t);
  end loop;
end;
$$;
