-- What happened in a workspace, and who was told. Features record events
-- (an outbox) right after their own writes; the API's dispatcher claims due
-- ones, hands each to its subscribers, and tries again later when one
-- fails. Notifications are what the notifier made of an event for one
-- person: a line in their feed, an email, or both.

create table public.events (
  id text primary key,
  workspace_id text not null references public.workspaces on delete cascade,
  type text not null check (char_length(type) between 1 and 100),
  -- Null when Dossier did it, like a scheduled sync or send.
  actor_user_id text references public.users on delete set null,
  payload jsonb not null default '{}',
  -- Set by publishers that want an event once, e.g. one per failing report.
  dedupe_key text check (char_length(dedupe_key) <= 300),
  occurred_at timestamptz not null,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null,
  -- A dispatcher has it until then; after, another may claim it again.
  locked_until timestamptz,
  dispatched_at timestamptz,
  -- Given up on after too many tries.
  failed_at timestamptz,
  last_error text,
  -- Nulls never collide, so events without a key are never dropped.
  unique (workspace_id, dedupe_key)
);
create index events_due_idx on public.events (next_attempt_at)
  where dispatched_at is null and failed_at is null;
create index events_workspace_idx on public.events (workspace_id, occurred_at);

create table public.notifications (
  id text primary key,
  workspace_id text not null references public.workspaces on delete cascade,
  user_id text not null references public.users on delete cascade,
  -- Not a foreign key: events are pruned sooner than notifications.
  event_id text not null,
  type text not null,
  title text not null check (char_length(title) between 1 and 300),
  body text not null default '' check (char_length(body) <= 2000),
  -- A path in the web app, e.g. /connections.
  link text check (char_length(link) <= 500),
  created_at timestamptz not null,
  read_at timestamptz,
  -- In their feed; false when they only wanted it by email.
  in_app boolean not null default true,
  -- Whether to email it, and how far that got.
  email boolean not null default false,
  email_claimed_at timestamptz,
  email_sent_at timestamptz,
  -- One per person per event, however often the event is handled.
  unique (event_id, user_id)
);
create index notifications_feed_idx
  on public.notifications (workspace_id, user_id, created_at desc)
  where in_app;
create index notifications_unread_idx
  on public.notifications (workspace_id, user_id)
  where in_app and read_at is null;
create index notifications_age_idx
  on public.notifications (workspace_id, created_at);

-- What each person wants to hear about, and how, by event type. Null, or
-- any type left out, means the defaults. Nullable because create_owner
-- builds the row with jsonb_populate_record, which ignores column defaults.
alter table public.workspace_members add column notification_preferences jsonb;

alter table public.events enable row level security;
alter table public.notifications enable row level security;

create policy tenant on public.events for all to dossier_app
  using (workspace_id = current_setting('app.workspace_id', true))
  with check (workspace_id = current_setting('app.workspace_id', true));
create policy tenant on public.notifications for all to dossier_app
  using (workspace_id = current_setting('app.workspace_id', true))
  with check (workspace_id = current_setting('app.workspace_id', true));

-- For the dispatcher: claims up to p_limit due events from every workspace
-- until p_until, counting the attempt. Two dispatchers never claim the same
-- event at once; one that dies lets its claim lapse.
create function public.claim_events(
  p_now timestamptz,
  p_until timestamptz,
  p_limit integer
) returns setof public.events
language sql
security definer
set search_path = ''
as $$
  update public.events e
  set locked_until = p_until, attempts = e.attempts + 1
  where e.id in (
    select d.id from public.events d
    where d.dispatched_at is null and d.failed_at is null
      and d.next_attempt_at <= p_now
      and (d.locked_until is null or d.locked_until <= p_now)
    order by d.next_attempt_at, d.id
    limit p_limit
    for update skip locked
  )
  returning e.*
$$;

revoke execute on function public.claim_events(timestamptz, timestamptz, integer)
  from public;
grant execute on function public.claim_events(timestamptz, timestamptz, integer)
  to dossier_app;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.events from anon, authenticated;
    revoke all on public.notifications from anon, authenticated;
    revoke execute on function public.claim_events(timestamptz, timestamptz, integer)
      from anon, authenticated;
    grant execute on function public.claim_events(timestamptz, timestamptz, integer)
      to service_role;
  end if;
end
$$;
