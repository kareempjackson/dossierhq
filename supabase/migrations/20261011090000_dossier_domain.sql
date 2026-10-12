-- Dossier's domain, replacing the scaffold's notes example.
--
-- Plain Postgres 15+: this schema backs both the `supabase` and the `postgres`
-- adapters. Every table carries workspace_id so the API can scope each query to
-- one MSP. Cited sources are stored as ordered text[] of source IDs.

drop table if exists public.notes;

create table public.workspaces (
  id text primary key,
  name text not null,
  user_name text not null,
  user_role text not null,
  time_zone text not null
);

create table public.clients (
  id text primary key,
  workspace_id text not null references public.workspaces on delete cascade,
  name text not null,
  industry text not null,
  location text not null,
  seats integer not null check (seats >= 0),
  contact_name text not null,
  contact_role text not null,
  contract_plan text not null,
  contract_started_on date not null,
  contract_renews_on date not null,
  contract_monthly_fee numeric(12, 2) not null check (contract_monthly_fee >= 0),
  contract_currency char(3) not null,
  contract_includes text[] not null default '{}'
);
create index clients_workspace_name_idx on public.clients (workspace_id, name);

-- When the user last opened each client, for "Recent clients".
create table public.client_views (
  workspace_id text not null references public.workspaces on delete cascade,
  client_id text not null references public.clients on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (workspace_id, client_id)
);
create index client_views_recent_idx on public.client_views (workspace_id, viewed_at desc);

-- A record from a tool, or a moment in a meeting recording.
create table public.sources (
  id text primary key,
  workspace_id text not null references public.workspaces on delete cascade,
  client_id text references public.clients on delete cascade,
  kind text not null check (kind in ('record', 'meeting')),
  tool text not null check (tool in ('ninjaone', 'hudu', 'sharepoint', 'fathom')),
  record_id text not null,
  record_type text not null,
  title text not null,
  recorded_at timestamptz not null,
  url text not null,
  fields jsonb not null default '[]',
  meeting_id text,
  transcript_at text check (transcript_at ~ '^\d{2}:\d{2}:\d{2}$'),
  speaker_role text check (speaker_role in ('client', 'msp')),
  speaker_name text,
  quote text,
  constraint sources_meeting_fields check (
    kind = 'record'
    or (
      tool = 'fathom'
      and meeting_id is not null
      and transcript_at is not null
      and speaker_role is not null
      and speaker_name is not null
      and quote is not null
    )
  )
);
create index sources_client_recorded_idx on public.sources (workspace_id, client_id, recorded_at desc);

create table public.attention_items (
  id text primary key,
  workspace_id text not null references public.workspaces on delete cascade,
  client_id text references public.clients on delete cascade,
  kind text not null check (kind in ('alert', 'risk', 'commitment', 'connection')),
  urgency text not null check (urgency in ('critical', 'high', 'normal')),
  title text not null,
  raised_at timestamptz not null,
  source_ids text[] not null check (cardinality(source_ids) > 0)
);
create index attention_items_workspace_idx on public.attention_items (workspace_id, client_id);

create table public.recommendations (
  id text primary key,
  workspace_id text not null references public.workspaces on delete cascade,
  client_id text not null references public.clients on delete cascade,
  status text not null check (status in ('draft', 'accepted', 'dismissed')),
  title text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  source_ids text[] not null check (cardinality(source_ids) > 0)
);
create index recommendations_workspace_idx on public.recommendations (workspace_id, client_id, status);

create table public.commitments (
  id text primary key,
  workspace_id text not null references public.workspaces on delete cascade,
  client_id text not null references public.clients on delete cascade,
  statement text not null,
  made_at timestamptz not null,
  due_on date,
  status text not null check (status in ('open', 'done')),
  completed_at timestamptz,
  source_ids text[] not null check (cardinality(source_ids) > 0)
);
create index commitments_workspace_idx on public.commitments (workspace_id, client_id);

create table public.meetings (
  id text primary key,
  workspace_id text not null references public.workspaces on delete cascade,
  client_id text not null references public.clients on delete cascade,
  title text not null,
  occurred_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes > 0),
  attendees jsonb not null,
  planning jsonb not null default '[]',
  concerns jsonb not null default '[]',
  asked_for jsonb not null default '[]',
  recording_source_id text not null references public.sources
);
create index meetings_client_idx on public.meetings (workspace_id, client_id, occurred_at desc);

create table public.devices (
  id text primary key,
  workspace_id text not null references public.workspaces on delete cascade,
  client_id text not null references public.clients on delete cascade,
  name text not null,
  type text not null check (type in ('workstation', 'laptop', 'server', 'network')),
  os text not null,
  assigned_to text,
  last_seen_at timestamptz not null,
  patch_status text not null check (patch_status in ('current', 'pending', 'failed')),
  source_id text not null references public.sources
);
create index devices_client_idx on public.devices (workspace_id, client_id);

-- The report body (glance strip and sections with cited lines) is one document.
create table public.reports (
  id text primary key,
  workspace_id text not null references public.workspaces on delete cascade,
  client_id text not null references public.clients on delete cascade,
  week_start date not null,
  week_end date not null,
  status text not null check (status in ('draft', 'approved', 'skipped')),
  generated_at timestamptz not null,
  approved_at timestamptz,
  exceptions text[] not null default '{}',
  title text not null,
  glance jsonb not null default '[]',
  sections jsonb not null default '[]',
  unique (client_id, week_start)
);
create index reports_workspace_idx on public.reports (workspace_id, week_start desc, status);

create table public.connectors (
  id text primary key,
  workspace_id text not null references public.workspaces on delete cascade,
  tool text not null check (tool in ('ninjaone', 'hudu', 'sharepoint', 'fathom')),
  scope text not null,
  access text not null,
  status text not null check (status in ('healthy', 'syncing', 'failing')),
  last_sync_at timestamptz not null,
  failure jsonb,
  unique (workspace_id, tool)
);

create table public.audit_entries (
  id text primary key,
  workspace_id text not null references public.workspaces on delete cascade,
  at timestamptz not null,
  tool text not null check (tool in ('ninjaone', 'hudu', 'sharepoint', 'fathom')),
  read text not null,
  client_id text references public.clients on delete cascade,
  record_count integer not null check (record_count >= 0)
);
create index audit_entries_recent_idx on public.audit_entries (workspace_id, at desc);

-- One row per client for the clients list: attention counts, last meeting and
-- latest report. security_invoker makes it obey the caller's RLS.
create view public.client_overview with (security_invoker = true) as
select
  c.workspace_id,
  c.id as client_id,
  count(a.id)::int as attention_total,
  (count(a.id) filter (where a.urgency = 'critical'))::int as attention_critical,
  (count(a.id) filter (where a.urgency = 'high'))::int as attention_high,
  (select max(m.occurred_at) from public.meetings m where m.client_id = c.id) as last_meeting_at,
  (
    select r.id from public.reports r
    where r.client_id = c.id
    order by r.week_start desc
    limit 1
  ) as latest_report_id
from public.clients c
left join public.attention_items a on a.client_id = c.id
group by c.workspace_id, c.id;

-- All reads and writes go through the API with server-side credentials, so the
-- browser-facing roles get nothing. Add policies if that ever changes.
alter table public.workspaces enable row level security;
alter table public.clients enable row level security;
alter table public.client_views enable row level security;
alter table public.sources enable row level security;
alter table public.attention_items enable row level security;
alter table public.recommendations enable row level security;
alter table public.commitments enable row level security;
alter table public.meetings enable row level security;
alter table public.devices enable row level security;
alter table public.reports enable row level security;
alter table public.connectors enable row level security;
alter table public.audit_entries enable row level security;

-- Supabase grants new objects to its browser roles by default; take that back.
-- Skipped on plain Postgres, where those roles don't exist.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon, authenticated;
  end if;
end
$$;
