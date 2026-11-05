-- What Dossier read about each person at a client, on the reading model:
-- the trouble they keep having, their devices, how they sound, and what's
-- owed to them, from their tickets, devices and what they said in meetings.
-- People aren't stored, only found in the records, so a profile is keyed by
-- the person's key, as their page is.
--
-- Meeting transcripts need no table of their own: they're kept in memory
-- (memory_documents of kind 'transcript'), past the sync window like tickets.

create table public.person_insights (
  workspace_id text not null references public.workspaces on delete cascade,
  client_id text not null references public.clients on delete cascade,
  person_key text not null,
  input_hash text not null,
  status text not null check (status in ('ok', 'failed')),
  model text,
  -- Internal ticket notes were read too, so it goes if they stop being shared.
  with_internal boolean not null default false,
  -- The profile, as packages/contracts PersonProfile; null when it failed.
  profile jsonb,
  error text,
  attempted_at timestamptz not null,
  read_at timestamptz,
  primary key (workspace_id, client_id, person_key)
);

alter table public.person_insights enable row level security;
create policy tenant on public.person_insights for all to dossier_app
  using (workspace_id = current_setting('app.workspace_id', true))
  with check (workspace_id = current_setting('app.workspace_id', true));

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.person_insights from anon, authenticated;
  end if;
end
$$;
