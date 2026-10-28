-- What the intelligence layer keeps: the model each workspace drafts with, a
-- log of every piece of work a model did (for its cost, and to skip work whose
-- input hasn't changed), and which recommendations a run drafted. Syncs never
-- touch any of it.

-- Null means the API's default model.
alter table public.workspaces add column intelligence_model text;

create table public.intelligence_runs (
  id text primary key,
  workspace_id text not null references public.workspaces on delete cascade,
  -- Null for work across the workspace.
  client_id text references public.clients on delete cascade,
  kind text not null check (kind in ('recommendations', 'ask', 'meetings', 'reports', 'patterns')),
  -- A hash of what the model read.
  input_hash text,
  model text not null,
  -- {inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens}
  usage jsonb not null,
  -- US dollars, at the model's prices when it ran.
  cost double precision not null,
  status text not null check (status in ('ok', 'failed', 'refused')),
  error text,
  started_at timestamptz not null,
  finished_at timestamptz not null
);
create index intelligence_runs_recent_idx on public.intelligence_runs (workspace_id, started_at desc);
create index intelligence_runs_last_idx on public.intelligence_runs (workspace_id, kind, client_id, started_at desc);

alter table public.intelligence_runs enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.intelligence_runs from anon, authenticated;
  end if;
end
$$;

-- The run that drafted a recommendation (null for ones no run made), and
-- whether a person has since changed its wording.
alter table public.recommendations
  add column run_id text,
  add column edited boolean not null default false;

-- Swaps a client's drafts from earlier runs that nobody edited for a fresh
-- set. Accepted, dismissed and edited ones stay, as does anything no run made.
create function public.replace_recommendation_drafts(
  p_workspace_id text,
  p_client_id text,
  p_rows jsonb
) returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.recommendations
  where workspace_id = p_workspace_id
    and client_id = p_client_id
    and status = 'draft'
    and run_id is not null
    and not edited;

  insert into public.recommendations
  select * from jsonb_populate_recordset(null::public.recommendations, p_rows);
end;
$$;

revoke execute on function public.replace_recommendation_drafts(text, text, jsonb) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.replace_recommendation_drafts(text, text, jsonb) from anon, authenticated;
    grant execute on function public.replace_recommendation_drafts(text, text, jsonb) to service_role;
  end if;
end
$$;
