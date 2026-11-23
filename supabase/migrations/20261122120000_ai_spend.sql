-- What a workspace's runs used and cost, added up by kind in the database.
-- The Intelligence page used to load every run of the last 30 days to add
-- them up itself: tens of thousands of rows for a busy workspace, each time
-- the page opened.

create function public.ai_spend(p_workspace_id text, p_since timestamptz)
returns table (
  kind text,
  runs bigint,
  input_tokens bigint,
  output_tokens bigint,
  cache_read_tokens bigint,
  cache_write_tokens bigint,
  cost numeric
)
language sql
stable
set search_path = ''
as $$
  select
    r.kind,
    count(*),
    coalesce(sum((r.usage->>'inputTokens')::bigint), 0)::bigint,
    coalesce(sum((r.usage->>'outputTokens')::bigint), 0)::bigint,
    coalesce(sum((r.usage->>'cacheReadTokens')::bigint), 0)::bigint,
    coalesce(sum((r.usage->>'cacheWriteTokens')::bigint), 0)::bigint,
    coalesce(sum(r.cost), 0)
  from public.intelligence_runs r
  where r.workspace_id = p_workspace_id and r.started_at >= p_since
  group by r.kind
$$;

revoke execute on function public.ai_spend(text, timestamptz) from public;
grant execute on function public.ai_spend(text, timestamptz) to dossier_app;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.ai_spend(text, timestamptz)
      from anon, authenticated;
    grant execute on function public.ai_spend(text, timestamptz)
      to service_role;
  end if;
end
$$;
