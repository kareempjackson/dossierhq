-- Syncs failed on hosted with "canceling statement due to statement timeout".
-- PostgREST gives each call 8 seconds (the authenticator role's
-- statement_timeout), and replace_tool_records deleted and rewrote every
-- record a tool had sent, ticket threads included, on every sync.
--
-- 1. Index the columns that point at sources. Deleting a source makes
--    Postgres check that nothing still points at it; without these indexes
--    each check read the whole of tickets, devices and meetings, so a sync
--    cost the square of its size.
-- 2. Rewrite only what changed. A row the tool sends back unchanged stays as
--    it is. One that changed, or whose source changed, is replaced, and one
--    the tool no longer sends is deleted. Rows are compared whole, so columns
--    added later are covered without changing this function.
-- 3. Take turns. Two API processes syncing the same tool for a workspace
--    (production and a dev API on the same database, or two replicas) ran
--    their deletes and inserts into each other.

create index if not exists tickets_source_idx on public.tickets (source_id);
create index if not exists devices_source_idx on public.devices (source_id);
create index if not exists meetings_recording_source_idx
  on public.meetings (recording_source_id);

create or replace function public.replace_tool_records(
  p_workspace_id text,
  p_tool text,
  p_records jsonb
) returns void
language plpgsql
set search_path = ''
as $$
declare
  -- The tool's sources this sync changes or drops.
  stale_sources text[];
begin
  perform pg_advisory_xact_lock(
    hashtextextended('replace_tool_records ' || p_workspace_id || ' ' || p_tool, 0)
  );

  select coalesce(array_agg(s.id), '{}') into stale_sources
  from public.sources s
  where s.workspace_id = p_workspace_id and s.tool = p_tool
    and not exists (
      select 1
      from jsonb_populate_recordset(null::public.sources, p_records -> 'sources') n
      where n.id = s.id and to_jsonb(n) = to_jsonb(s)
    );

  -- Rows citing a stale source go, so the source can be replaced; they come
  -- back below with the rest.
  delete from public.devices
  where workspace_id = p_workspace_id and tool = p_tool
    and source_id = any (stale_sources);
  delete from public.tickets
  where workspace_id = p_workspace_id and tool = p_tool
    and source_id = any (stale_sources);
  delete from public.meetings
  where workspace_id = p_workspace_id and tool = p_tool
    and recording_source_id = any (stale_sources);

  -- Rows the tool changed or no longer sends.
  delete from public.attention_items t
  where t.workspace_id = p_workspace_id and t.tool = p_tool
    and not exists (
      select 1
      from jsonb_populate_recordset(null::public.attention_items, p_records -> 'attention') n
      where n.id = t.id and to_jsonb(n) = to_jsonb(t)
    );
  delete from public.commitments t
  where t.workspace_id = p_workspace_id and t.tool = p_tool
    and not exists (
      select 1
      from jsonb_populate_recordset(null::public.commitments, p_records -> 'commitments') n
      where n.id = t.id and to_jsonb(n) = to_jsonb(t)
    );
  delete from public.devices t
  where t.workspace_id = p_workspace_id and t.tool = p_tool
    and not exists (
      select 1
      from jsonb_populate_recordset(null::public.devices, p_records -> 'devices') n
      where n.id = t.id and to_jsonb(n) = to_jsonb(t)
    );
  delete from public.tickets t
  where t.workspace_id = p_workspace_id and t.tool = p_tool
    and not exists (
      select 1
      from jsonb_populate_recordset(null::public.tickets, p_records -> 'tickets') n
      where n.id = t.id and to_jsonb(n) = to_jsonb(t)
    );
  delete from public.meetings t
  where t.workspace_id = p_workspace_id and t.tool = p_tool
    and not exists (
      select 1
      from jsonb_populate_recordset(null::public.meetings, p_records -> 'meetings') n
      where n.id = t.id and to_jsonb(n) = to_jsonb(t)
    );
  delete from public.sources
  where workspace_id = p_workspace_id and tool = p_tool
    and id = any (stale_sources);

  -- Everything sent that isn't there now: new rows and changed ones. An id
  -- another tool or workspace holds still fails on the primary key, as before.
  insert into public.sources
  select n.* from jsonb_populate_recordset(null::public.sources, p_records -> 'sources') n
  where not exists (
    select 1 from public.sources s
    where s.id = n.id and s.workspace_id = p_workspace_id and s.tool = p_tool
  );
  insert into public.devices
  select n.* from jsonb_populate_recordset(null::public.devices, p_records -> 'devices') n
  where not exists (
    select 1 from public.devices t
    where t.id = n.id and t.workspace_id = p_workspace_id and t.tool = p_tool
  );
  insert into public.tickets
  select n.* from jsonb_populate_recordset(null::public.tickets, p_records -> 'tickets') n
  where not exists (
    select 1 from public.tickets t
    where t.id = n.id and t.workspace_id = p_workspace_id and t.tool = p_tool
  );
  insert into public.meetings
  select n.* from jsonb_populate_recordset(null::public.meetings, p_records -> 'meetings') n
  where not exists (
    select 1 from public.meetings t
    where t.id = n.id and t.workspace_id = p_workspace_id and t.tool = p_tool
  );
  insert into public.commitments
  select n.* from jsonb_populate_recordset(null::public.commitments, p_records -> 'commitments') n
  where not exists (
    select 1 from public.commitments t
    where t.id = n.id and t.workspace_id = p_workspace_id and t.tool = p_tool
  );
  insert into public.attention_items
  select n.* from jsonb_populate_recordset(null::public.attention_items, p_records -> 'attention') n
  where not exists (
    select 1 from public.attention_items t
    where t.id = n.id and t.workspace_id = p_workspace_id and t.tool = p_tool
  );
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
