-- =============================================================================
-- "Handled by": which team member (Srikar, Nikhil, Jethin) owns a record.
-- =============================================================================
--
-- * leads.owner already existed (free text, unused: all NULL). It is now
--   limited to the three team members. Clients, projects, tasks and follow-ups
--   get the same column so their pages can show it.
-- * team_members.name links a login to one of those names, so the app can
--   default new records to the signed-in person and filter "Handled by me".
-- * NULL means unassigned.
-- * Adding a fourth person: extend the CHECK lists below (and HANDLERS in
--   src/lib/types.ts), then set their team_members.name.
-- =============================================================================

alter table public.leads
  add constraint leads_owner_check check (owner in ('Srikar', 'Nikhil', 'Jethin'));

alter table public.clients
  add column owner text check (owner in ('Srikar', 'Nikhil', 'Jethin'));
alter table public.projects
  add column owner text check (owner in ('Srikar', 'Nikhil', 'Jethin'));
alter table public.tasks
  add column owner text check (owner in ('Srikar', 'Nikhil', 'Jethin'));
alter table public.followups
  add column owner text check (owner in ('Srikar', 'Nikhil', 'Jethin'));

create index leads_owner_idx     on public.leads (owner);
create index clients_owner_idx   on public.clients (owner);
create index projects_owner_idx  on public.projects (owner);
create index tasks_owner_idx     on public.tasks (owner);
create index followups_owner_idx on public.followups (owner);

-- One login per name.
alter table public.team_members
  add column name text unique check (name in ('Srikar', 'Nikhil', 'Jethin'));

update public.team_members set name = 'Srikar' where email = 'srikarakula123@gmail.com';
update public.team_members set name = 'Nikhil' where email = 'nikhilgunipati@gmail.com';
-- Jethin is not a member yet. After creating his login:
--   insert into public.team_members (user_id, email, role, name)
--   select id, email, 'admin', 'Jethin' from auth.users where email = '<his email>';
