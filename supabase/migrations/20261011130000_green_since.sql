-- =============================================================================
-- leads.green_since: when a lead became green.
-- =============================================================================
--
-- Set by trigger so it is correct however the stage changes (dropdown, bulk
-- action, call remark, import):
--   * becomes green (from a non-green stage, or inserted green) -> now()
--   * moves between green stages (e.g. Interested -> High Priority) -> kept
--   * leaves green -> NULL; if it turns green again it gets a fresh date
--
-- Green stages: Interested, Not Sure, High Priority, Qualified, Proposal Sent,
-- Negotiation, Won. Keep in sync with GREEN_STATUSES in the frontend.
--
-- Backfill: leads already green when this ran have no recorded date, so their
-- last-modified time is used as the closest available approximation.
-- =============================================================================

alter table public.leads add column green_since timestamptz;

create or replace function public.set_green_since()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  green constant text[] := array['Interested', 'Not Sure', 'High Priority', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won'];
begin
  if new.status = any (green) then
    if tg_op = 'INSERT' then
      new.green_since := coalesce(new.green_since, now());
    elsif not (old.status = any (green)) then
      new.green_since := now();
    else
      new.green_since := old.green_since;
    end if;
  else
    new.green_since := null;
  end if;
  return new;
end;
$$;

create trigger leads_set_green_since
  before insert or update of status on public.leads
  for each row execute function public.set_green_since();

update public.leads
set green_since = updated_at
where status in ('Interested', 'Not Sure', 'High Priority', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won')
  and green_since is null;
