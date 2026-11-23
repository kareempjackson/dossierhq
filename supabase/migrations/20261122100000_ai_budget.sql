-- Bounds on what a workspace's AI may spend, and a stop for when it can't
-- work. Before this nothing limited model calls: a loop read 1,453 tickets
-- 57,000 times in two days, and a key with no credit was retried thousands
-- of times a day.
--
-- - Dossier's own key is a trial: a count of the runs a workspace has had
--   on it (ai_shared_calls). The API stops at its limit and asks for a key.
-- - On its own key a workspace sets a daily budget (ai_daily_budget, in
--   dollars; null is the API's default). ai_usage_days adds up each day.
-- - When runs keep failing, or fail in a way the next will too (no credit,
--   a refused key), background work is paused until ai_paused_until, for
--   longer each time (ai_pause_steps), and resumes on the next success.
--
-- All nullable: create_owner builds workspace rows with
-- jsonb_populate_record, which ignores column defaults.

alter table public.workspaces
  add column ai_daily_budget double precision
    check (ai_daily_budget is null or ai_daily_budget >= 0),
  add column ai_shared_calls integer,
  add column ai_failures integer,
  add column ai_pause_steps integer,
  add column ai_paused_until timestamptz,
  add column ai_paused_reason text;

create table public.ai_usage_days (
  workspace_id text not null references public.workspaces on delete cascade,
  day date not null,
  -- Whose key paid: Dossier's ('shared') or the workspace's ('own').
  key_owner text not null check (key_owner in ('shared', 'own')),
  calls integer not null default 0,
  cost double precision not null default 0,
  primary key (workspace_id, day, key_owner)
);

alter table public.ai_usage_days enable row level security;

create policy tenant on public.ai_usage_days for all to dossier_app
  using (workspace_id = current_setting('app.workspace_id', true))
  with check (workspace_id = current_setting('app.workspace_id', true));

-- What the API checks before each model call, in one read.
create function public.ai_guard(p_workspace_id text, p_day date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'shared_calls', coalesce(w.ai_shared_calls, 0),
    'daily_budget', w.ai_daily_budget,
    'spent_today', coalesce((
      select d.cost from public.ai_usage_days d
      where d.workspace_id = w.id and d.day = p_day and d.key_owner = 'own'
    ), 0),
    'paused_until', w.ai_paused_until,
    'paused_reason', w.ai_paused_reason
  )
  from public.workspaces w
  where w.id = p_workspace_id
$$;

-- Saves a run and counts it, together: the day's calls and cost, the trial
-- count for a run that worked on Dossier's key, and the pause. A success
-- clears the pause. A failure counts toward one; p_stop (the next call would
-- fail the same way) or five failures in a row starts it: 15 minutes, then
-- double each time, up to a day.
create function public.record_ai_run(
  p_run jsonb,
  p_owner text,
  p_day date,
  p_now timestamptz,
  p_stop boolean
) returns void
language plpgsql
set search_path = ''
as $$
declare
  run public.intelligence_runs;
  failures integer;
begin
  run := jsonb_populate_record(null::public.intelligence_runs, p_run);

  insert into public.intelligence_runs select run.*
  on conflict (id) do update set
    client_id = excluded.client_id,
    kind = excluded.kind,
    input_hash = excluded.input_hash,
    model = excluded.model,
    usage = excluded.usage,
    cost = excluded.cost,
    status = excluded.status,
    error = excluded.error,
    started_at = excluded.started_at,
    finished_at = excluded.finished_at;

  insert into public.ai_usage_days as d (workspace_id, day, key_owner, calls, cost)
  values (run.workspace_id, p_day, p_owner, 1, run.cost)
  on conflict (workspace_id, day, key_owner) do update
    set calls = d.calls + 1, cost = d.cost + excluded.cost;

  if run.status = 'ok' then
    update public.workspaces w set
      ai_shared_calls = coalesce(w.ai_shared_calls, 0)
        + case when p_owner = 'shared' then 1 else 0 end,
      ai_failures = 0,
      ai_pause_steps = 0,
      ai_paused_until = null,
      ai_paused_reason = null
    where w.id = run.workspace_id;
    return;
  end if;

  update public.workspaces w
  set ai_failures = coalesce(w.ai_failures, 0) + 1
  where w.id = run.workspace_id
  returning w.ai_failures into failures;

  if p_stop or failures >= 5 then
    update public.workspaces w set
      ai_paused_until = p_now + least(
        interval '15 minutes' * power(2, least(coalesce(w.ai_pause_steps, 0), 10)),
        interval '24 hours'
      ),
      ai_pause_steps = coalesce(w.ai_pause_steps, 0) + 1,
      ai_paused_reason = left(coalesce(run.error, 'Runs kept failing.'), 500),
      ai_failures = 0
    where w.id = run.workspace_id;
  end if;
end
$$;

revoke execute on function public.ai_guard(text, date) from public;
revoke execute on function public.record_ai_run(jsonb, text, date, timestamptz, boolean)
  from public;
grant execute on function public.ai_guard(text, date) to dossier_app;
grant execute on function public.record_ai_run(jsonb, text, date, timestamptz, boolean)
  to dossier_app;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.ai_usage_days from anon, authenticated;
    revoke execute on function public.ai_guard(text, date) from anon, authenticated;
    revoke execute on function public.record_ai_run(jsonb, text, date, timestamptz, boolean)
      from anon, authenticated;
    grant execute on function public.ai_guard(text, date) to service_role;
    grant execute on function public.record_ai_run(jsonb, text, date, timestamptz, boolean)
      to service_role;
  end if;
end
$$;
