-- Weekly reports leave Dossier: each workspace's branding and schedule, who
-- each client's report goes to, and a log of every send. A report records
-- when someone edited it and when it went out; a sent report can't change.

alter table public.reports
  add column edited_at timestamptz,
  add column sent_at timestamptz,
  add constraint reports_sent_approved check (sent_at is null or status = 'approved');

-- One row per workspace, made when someone first saves its settings. No row
-- means the defaults: the workspace's name, no logo, and no schedule.
create table public.report_settings (
  workspace_id text primary key references public.workspaces on delete cascade,
  sender_name text not null default '' check (char_length(sender_name) <= 100),
  reply_to text,
  brand_colour text not null default '#1f2937' check (brand_colour ~ '^#[0-9a-f]{6}$'),
  -- Base64, so every adapter reads it the same way; 256 KB once decoded.
  logo text check (char_length(logo) <= 349528),
  logo_type text check (logo_type in ('image/png', 'image/jpeg')),
  -- ISO weekday (1 is Monday) and hour, in the workspace's time zone.
  draft_weekday smallint check (draft_weekday between 1 and 7),
  draft_hour smallint check (draft_hour between 0 and 23),
  send_weekday smallint check (send_weekday between 1 and 7),
  send_hour smallint check (send_hour between 0 and 23),
  -- Reports approved since sending was turned on go out on schedule; older
  -- ones don't suddenly go out with them.
  send_from timestamptz,
  -- The week the schedule last drafted, so it drafts each week once.
  drafted_week date,
  check ((logo is null) = (logo_type is null)),
  check ((draft_weekday is null) = (draft_hour is null)),
  check ((send_weekday is null) = (send_hour is null)),
  check (send_weekday is null or send_from is not null)
);

create table public.client_recipients (
  workspace_id text not null references public.workspaces on delete cascade,
  client_id text not null references public.clients on delete cascade,
  position smallint not null,
  name text not null default '' check (char_length(name) <= 100),
  email text not null check (char_length(email) between 3 and 320),
  -- Copied in (cc) rather than addressed.
  copy boolean not null default false,
  primary key (client_id, position),
  unique (client_id, email)
);
create index client_recipients_workspace_idx
  on public.client_recipients (workspace_id, client_id);

create table public.report_deliveries (
  id text primary key,
  workspace_id text not null references public.workspaces on delete cascade,
  report_id text not null references public.reports on delete cascade,
  client_id text not null references public.clients on delete cascade,
  at timestamptz not null,
  to_addresses text[] not null,
  cc_addresses text[] not null default '{}',
  outcome text not null check (outcome in ('sent', 'failed')),
  problem text,
  message_id text,
  -- Null when it went on schedule.
  sent_by text references public.users on delete set null,
  sent_by_name text
);
create index report_deliveries_report_idx
  on public.report_deliveries (workspace_id, report_id, at desc);

alter table public.report_settings enable row level security;
alter table public.client_recipients enable row level security;
alter table public.report_deliveries enable row level security;

create policy tenant on public.report_settings for all to dossier_app
  using (workspace_id = current_setting('app.workspace_id', true))
  with check (workspace_id = current_setting('app.workspace_id', true));
create policy tenant on public.client_recipients for all to dossier_app
  using (workspace_id = current_setting('app.workspace_id', true))
  with check (workspace_id = current_setting('app.workspace_id', true));
create policy tenant on public.report_deliveries for all to dossier_app
  using (workspace_id = current_setting('app.workspace_id', true))
  with check (workspace_id = current_setting('app.workspace_id', true));

-- For the report scheduler: the workspaces with a schedule, and nothing else.
create function public.scheduled_report_workspaces()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select s.workspace_id from public.report_settings s
  where s.draft_weekday is not null or s.send_weekday is not null
$$;

revoke execute on function public.scheduled_report_workspaces() from public;
grant execute on function public.scheduled_report_workspaces() to dossier_app;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.report_settings from anon, authenticated;
    revoke all on public.client_recipients from anon, authenticated;
    revoke all on public.report_deliveries from anon, authenticated;
    revoke execute on function public.scheduled_report_workspaces()
      from anon, authenticated;
    grant execute on function public.scheduled_report_workspaces()
      to service_role;
  end if;
end
$$;

-- Replaces a client's recipients in one go, for the Data API adapter.
create function public.replace_client_recipients(
  p_workspace_id text,
  p_client_id text,
  p_rows jsonb
) returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.clients
    where workspace_id = p_workspace_id and id = p_client_id
  ) then
    return;
  end if;

  delete from public.client_recipients
  where workspace_id = p_workspace_id and client_id = p_client_id;

  insert into public.client_recipients
  select * from jsonb_populate_recordset(null::public.client_recipients, p_rows);
end;
$$;

revoke execute on function public.replace_client_recipients(text, text, jsonb) from public;
grant execute on function public.replace_client_recipients(text, text, jsonb) to dossier_app;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.replace_client_recipients(text, text, jsonb)
      from anon, authenticated;
    grant execute on function public.replace_client_recipients(text, text, jsonb)
      to service_role;
  end if;
end
$$;
