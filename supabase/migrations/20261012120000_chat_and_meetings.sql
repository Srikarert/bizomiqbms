-- =============================================================================
-- Team chat and meetings.
-- =============================================================================
--
-- chat_messages   One shared channel for Srikar, Nikhil and Jethin. A message
--                 can carry a lead, a follow-up and/or a meeting as an
--                 attachment (shown as a card in the chat).
-- meetings        Scheduled meetings with a join link (any https URL, e.g.
--                 Google Meet, Zoom or a Jitsi room).
--
-- Follow-ups created from chat are normal rows in public.followups.
--
-- Access: team members only (public.is_team_member()); anon has no access.
-- sender_id / sender_name are set by a trigger so a message cannot be sent in
-- someone else's name. People can delete only their own messages.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- meetings
-- -----------------------------------------------------------------------------

create table public.meetings (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (length(btrim(title)) > 0),
  agenda           text,
  starts_at        timestamptz not null,
  duration_minutes integer not null default 30 check (duration_minutes between 5 and 480),
  link             text check (link is null or link ~* '^https?://'),
  attendees        text[] not null default '{}'
                     check (attendees <@ array['Srikar', 'Nikhil', 'Jethin']::text[]),
  lead_id          uuid references public.leads (id) on delete set null,
  status           text not null default 'Scheduled' check (status in ('Scheduled', 'Completed', 'Cancelled')),
  created_by       uuid default auth.uid() references auth.users (id) on delete set null,
  created_by_name  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index meetings_starts_at_idx  on public.meetings (starts_at);
create index meetings_lead_id_idx    on public.meetings (lead_id);
create index meetings_created_by_idx on public.meetings (created_by);

create trigger meetings_set_updated_at
  before update on public.meetings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- chat_messages
-- -----------------------------------------------------------------------------

create table public.chat_messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid default auth.uid() references auth.users (id) on delete set null,
  sender_name  text not null default '',
  body         text not null default '' check (length(body) <= 4000),
  lead_id      uuid references public.leads (id) on delete set null,
  follow_up_id uuid references public.followups (id) on delete set null,
  meeting_id   uuid references public.meetings (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index chat_messages_created_at_idx   on public.chat_messages (created_at desc);
create index chat_messages_sender_id_idx    on public.chat_messages (sender_id);
create index chat_messages_lead_id_idx      on public.chat_messages (lead_id);
create index chat_messages_follow_up_id_idx on public.chat_messages (follow_up_id);
create index chat_messages_meeting_id_idx   on public.chat_messages (meeting_id);

-- -----------------------------------------------------------------------------
-- Identity triggers (SECURITY INVOKER: a user can read their own team_members row)
-- -----------------------------------------------------------------------------

create or replace function public.set_chat_sender()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.sender_id := auth.uid();
  new.sender_name := coalesce(
    (select coalesce(tm.name, split_part(tm.email, '@', 1))
       from public.team_members tm where tm.user_id = auth.uid()),
    'Unknown');
  return new;
end;
$$;

create trigger chat_messages_set_sender
  before insert on public.chat_messages
  for each row execute function public.set_chat_sender();

create or replace function public.set_meeting_creator()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.created_by := auth.uid();
  new.created_by_name := coalesce(
    (select coalesce(tm.name, split_part(tm.email, '@', 1))
       from public.team_members tm where tm.user_id = auth.uid()),
    'Unknown');
  return new;
end;
$$;

create trigger meetings_set_creator
  before insert on public.meetings
  for each row execute function public.set_meeting_creator();

-- -----------------------------------------------------------------------------
-- Privileges and RLS
-- -----------------------------------------------------------------------------

revoke all on public.chat_messages, public.meetings from anon, authenticated;
grant select, insert, delete on public.chat_messages to authenticated;
grant select, insert, update, delete on public.meetings to authenticated;

alter table public.chat_messages enable row level security;
alter table public.meetings      enable row level security;

create policy "chat_messages: team members can read"
  on public.chat_messages for select to authenticated
  using ((select public.is_team_member()));
create policy "chat_messages: team members can send"
  on public.chat_messages for insert to authenticated
  with check ((select public.is_team_member()));
-- Only the sender can remove a message.
create policy "chat_messages: sender can delete"
  on public.chat_messages for delete to authenticated
  using ((select public.is_team_member()) and sender_id = (select auth.uid()));

create policy "meetings: team members can read"
  on public.meetings for select to authenticated using ((select public.is_team_member()));
create policy "meetings: team members can insert"
  on public.meetings for insert to authenticated with check ((select public.is_team_member()));
create policy "meetings: team members can update"
  on public.meetings for update to authenticated
  using ((select public.is_team_member())) with check ((select public.is_team_member()));
create policy "meetings: team members can delete"
  on public.meetings for delete to authenticated using ((select public.is_team_member()));

-- -----------------------------------------------------------------------------
-- Realtime: new chat messages appear instantly for everyone.
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end;
$$;
