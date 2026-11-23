-- Who is doing a workspace's background work right now. Syncs and AI passes
-- used to be guarded only by each API process's own memory, so two
-- processes on one database (production and a developer's API, or two
-- instances) each ran the same sync and the same pass, and a tool one of
-- them was syncing looked "cut short" to the other.
--
-- A lease is taken before the work, renewed while it runs, and released
-- after. A process that dies lets its lease lapse, and another takes over.

create table public.work_leases (
  workspace_id text not null references public.workspaces on delete cascade,
  -- What's being done: 'sync:ninjaone', 'intelligence', 'memory-backfill'…
  job text not null check (char_length(job) between 1 and 100),
  -- The API process that has it.
  holder text not null check (char_length(holder) between 1 and 100),
  expires_at timestamptz not null,
  primary key (workspace_id, job)
);

alter table public.work_leases enable row level security;

create policy tenant on public.work_leases for all to dossier_app
  using (workspace_id = current_setting('app.workspace_id', true))
  with check (workspace_id = current_setting('app.workspace_id', true));

-- Takes the job for p_holder until p_until, and says whether it got it:
-- when nobody has it, when whoever had it let it lapse, or when p_holder
-- already has it (which renews it). Two processes asking at once take
-- turns on the row, so only one wins.
create function public.claim_work(
  p_workspace_id text,
  p_job text,
  p_holder text,
  p_now timestamptz,
  p_until timestamptz
) returns boolean
language sql
set search_path = ''
as $$
  with won as (
    insert into public.work_leases as l (workspace_id, job, holder, expires_at)
    values (p_workspace_id, p_job, p_holder, p_until)
    on conflict (workspace_id, job) do update
      set holder = excluded.holder, expires_at = excluded.expires_at
      where l.expires_at <= p_now or l.holder = p_holder
    returning 1
  )
  select exists (select 1 from won)
$$;

revoke execute on function public.claim_work(text, text, text, timestamptz, timestamptz)
  from public;
grant execute on function public.claim_work(text, text, text, timestamptz, timestamptz)
  to dossier_app;
grant select, insert, update, delete on public.work_leases to dossier_app;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.work_leases from anon, authenticated;
    revoke execute on function public.claim_work(text, text, text, timestamptz, timestamptz)
      from anon, authenticated;
    grant execute on function public.claim_work(text, text, text, timestamptz, timestamptz)
      to service_role;
  end if;
end
$$;
