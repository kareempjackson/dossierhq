-- Real integrations: clients built from the tools, connector credentials, and
-- the functions a sync uses to swap one tool's records in a single transaction.

-- Clients ---------------------------------------------------------------------
-- The tools rarely know industry, seats, contacts or contract terms, so those
-- become optional. Domains match Fathom meetings to clients.

alter table public.clients
  alter column industry drop not null,
  alter column location drop not null,
  alter column seats drop not null,
  alter column contact_name drop not null,
  alter column contact_role drop not null,
  alter column contract_plan drop not null,
  alter column contract_started_on drop not null,
  alter column contract_renews_on drop not null,
  alter column contract_monthly_fee drop not null,
  alter column contract_currency drop not null,
  alter column contract_includes drop not null,
  add column domains text[] not null default '{}',
  add column created_at timestamptz not null default now();

-- Where each client lives in each tool: a NinjaOne organisation, a Hudu
-- company, a SharePoint folder.
create table public.client_links (
  workspace_id text not null references public.workspaces on delete cascade,
  tool text not null check (tool in ('ninjaone', 'hudu', 'sharepoint', 'fathom')),
  external_id text not null,
  client_id text not null references public.clients on delete cascade,
  name text not null,
  url text not null,
  primary key (workspace_id, tool, external_id)
);
create index client_links_client_idx on public.client_links (client_id);

-- Connectors ------------------------------------------------------------------

alter table public.connectors
  alter column last_sync_at drop not null,
  add column account text not null default '',
  -- AES-256-GCM ciphertext of the tool's credentials (see the API's
  -- integrations/secrets.ts). Never returned by the API.
  add column credentials text not null default '',
  -- Whatever the connector needs between syncs, e.g. a delta link.
  add column state jsonb not null default '{}';

-- Records a sync wrote ----------------------------------------------------------
-- Each synced row carries the tool it came from, so a sync can replace exactly
-- its own rows. Null means it didn't come from a sync.

alter table public.devices add column tool text check (tool in ('ninjaone', 'hudu', 'sharepoint', 'fathom'));
alter table public.meetings add column tool text check (tool in ('ninjaone', 'hudu', 'sharepoint', 'fathom'));
alter table public.commitments add column tool text check (tool in ('ninjaone', 'hudu', 'sharepoint', 'fathom'));
alter table public.attention_items add column tool text check (tool in ('ninjaone', 'hudu', 'sharepoint', 'fathom'));

create index sources_tool_idx on public.sources (workspace_id, tool);
create index devices_tool_idx on public.devices (workspace_id, tool);
create index meetings_tool_idx on public.meetings (workspace_id, tool);
create index commitments_tool_idx on public.commitments (workspace_id, tool);
create index attention_items_tool_idx on public.attention_items (workspace_id, tool);

alter table public.client_links enable row level security;

-- Functions -------------------------------------------------------------------
-- Rows arrive as JSON arrays of objects keyed by column name, including
-- workspace_id and tool, so every column is spelled out by the caller.

-- Upserts the clients a tool created or updated, replaces that tool's links,
-- and removes clients the tool brought in that no tool links to any more.
create function public.sync_clients(
  p_workspace_id text,
  p_tool text,
  p_clients jsonb,
  p_links jsonb
) returns void
language plpgsql
set search_path = ''
as $$
declare
  previously_linked text[];
begin
  select coalesce(array_agg(client_id), '{}') into previously_linked
  from public.client_links
  where workspace_id = p_workspace_id and tool = p_tool;

  insert into public.clients
  select * from jsonb_populate_recordset(null::public.clients, p_clients)
  on conflict (id) do update set
    name = excluded.name,
    industry = excluded.industry,
    location = excluded.location,
    seats = excluded.seats,
    contact_name = excluded.contact_name,
    contact_role = excluded.contact_role,
    domains = excluded.domains
  where public.clients.workspace_id = p_workspace_id;

  delete from public.client_links
  where workspace_id = p_workspace_id and tool = p_tool;

  insert into public.client_links
  select * from jsonb_populate_recordset(null::public.client_links, p_links);

  delete from public.clients c
  where c.workspace_id = p_workspace_id
    and c.id = any (previously_linked)
    and not exists (select 1 from public.client_links l where l.client_id = c.id);
end;
$$;

-- Swaps everything one tool wrote for a workspace for a fresh set.
create function public.replace_tool_records(
  p_workspace_id text,
  p_tool text,
  p_records jsonb
) returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.attention_items where workspace_id = p_workspace_id and tool = p_tool;
  delete from public.commitments where workspace_id = p_workspace_id and tool = p_tool;
  delete from public.devices where workspace_id = p_workspace_id and tool = p_tool;
  delete from public.meetings where workspace_id = p_workspace_id and tool = p_tool;
  delete from public.sources where workspace_id = p_workspace_id and tool = p_tool;

  insert into public.sources
  select * from jsonb_populate_recordset(null::public.sources, p_records -> 'sources');
  insert into public.devices
  select * from jsonb_populate_recordset(null::public.devices, p_records -> 'devices');
  insert into public.meetings
  select * from jsonb_populate_recordset(null::public.meetings, p_records -> 'meetings');
  insert into public.commitments
  select * from jsonb_populate_recordset(null::public.commitments, p_records -> 'commitments');
  insert into public.attention_items
  select * from jsonb_populate_recordset(null::public.attention_items, p_records -> 'attention');
end;
$$;

-- Adds or replaces some of a tool's records without touching the rest, e.g.
-- the "sync failing" item while the last good records stay in place.
create function public.upsert_tool_records(
  p_workspace_id text,
  p_tool text,
  p_records jsonb
) returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.attention_items
  where workspace_id = p_workspace_id and tool = p_tool
    and id in (select x ->> 'id' from jsonb_array_elements(coalesce(p_records -> 'attention', '[]')) x);
  delete from public.sources
  where workspace_id = p_workspace_id and tool = p_tool
    and id in (select x ->> 'id' from jsonb_array_elements(coalesce(p_records -> 'sources', '[]')) x);

  insert into public.sources
  select * from jsonb_populate_recordset(null::public.sources, p_records -> 'sources');
  insert into public.attention_items
  select * from jsonb_populate_recordset(null::public.attention_items, p_records -> 'attention');
end;
$$;

-- Removes everything a tool wrote, its links, and clients only it linked to.
create function public.remove_tool(p_workspace_id text, p_tool text) returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.replace_tool_records(p_workspace_id, p_tool, '{}');
  perform public.sync_clients(p_workspace_id, p_tool, '[]', '[]');
end;
$$;

-- Creates the first workspace and its owner, but only while there are no users
-- at all. Returns false (and changes nothing) otherwise.
create function public.create_first_owner(
  p_workspace jsonb,
  p_user jsonb,
  p_role text
) returns boolean
language plpgsql
set search_path = ''
as $$
begin
  lock table public.users in share row exclusive mode;
  if exists (select 1 from public.users) then
    return false;
  end if;
  insert into public.workspaces
  select * from jsonb_populate_record(null::public.workspaces, p_workspace);
  insert into public.users
  select * from jsonb_populate_record(null::public.users, p_user);
  insert into public.workspace_members (workspace_id, user_id, role)
  values (p_workspace ->> 'id', p_user ->> 'id', p_role);
  return true;
end;
$$;

-- Only the API's server-side credentials may call these. Postgres grants
-- EXECUTE to PUBLIC by default; take it back, and from Supabase's browser
-- roles where they exist.
revoke execute on function public.sync_clients(text, text, jsonb, jsonb) from public;
revoke execute on function public.replace_tool_records(text, text, jsonb) from public;
revoke execute on function public.upsert_tool_records(text, text, jsonb) from public;
revoke execute on function public.remove_tool(text, text) from public;
revoke execute on function public.create_first_owner(jsonb, jsonb, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon, authenticated;
    revoke execute on all functions in schema public from anon, authenticated;
    grant execute on all functions in schema public to service_role;
  end if;
end
$$;
