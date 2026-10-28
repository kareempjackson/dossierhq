-- Helpdesk tickets, read from NinjaOne's ticketing. Like devices, each row
-- carries the tool that wrote it, so a sync replaces exactly its own tickets.

create table public.tickets (
  id text primary key,
  workspace_id text not null references public.workspaces on delete cascade,
  client_id text not null references public.clients on delete cascade,
  -- The ticket's number in its tool, e.g. 4821.
  number text not null,
  subject text not null,
  -- The tool's own name for where it's at, e.g. "Waiting on client".
  status text not null,
  -- False once it is resolved or closed.
  open boolean not null,
  urgency text not null check (urgency in ('critical', 'high', 'normal')),
  requester text,
  assigned_to text,
  opened_at timestamptz not null,
  updated_at timestamptz not null,
  source_id text not null references public.sources,
  tool text check (tool in ('ninjaone', 'hudu', 'sharepoint', 'fathom'))
);
create index tickets_client_idx on public.tickets (workspace_id, client_id);
create index tickets_tool_idx on public.tickets (workspace_id, tool);

-- As for every other table: only the API's server-side credentials get in.
alter table public.tickets enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.tickets from anon, authenticated;
  end if;
end
$$;

-- Swaps everything one tool wrote for a workspace for a fresh set, now
-- including tickets. Tickets go before their sources and come back after.
create or replace function public.replace_tool_records(
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
  delete from public.tickets where workspace_id = p_workspace_id and tool = p_tool;
  delete from public.meetings where workspace_id = p_workspace_id and tool = p_tool;
  delete from public.sources where workspace_id = p_workspace_id and tool = p_tool;

  insert into public.sources
  select * from jsonb_populate_recordset(null::public.sources, p_records -> 'sources');
  insert into public.devices
  select * from jsonb_populate_recordset(null::public.devices, p_records -> 'devices');
  insert into public.tickets
  select * from jsonb_populate_recordset(null::public.tickets, p_records -> 'tickets');
  insert into public.meetings
  select * from jsonb_populate_recordset(null::public.meetings, p_records -> 'meetings');
  insert into public.commitments
  select * from jsonb_populate_recordset(null::public.commitments, p_records -> 'commitments');
  insert into public.attention_items
  select * from jsonb_populate_recordset(null::public.attention_items, p_records -> 'attention');
end;
$$;

-- Replacing a function keeps its grants, but say it again in case.
revoke execute on function public.replace_tool_records(text, text, jsonb) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.replace_tool_records(text, text, jsonb) from anon, authenticated;
    grant execute on function public.replace_tool_records(text, text, jsonb) to service_role;
  end if;
end
$$;
