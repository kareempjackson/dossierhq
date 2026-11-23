-- Batches of model requests that are out with the provider. Tickets outside
-- the window the client packs draw on don't need reading this minute, so
-- they go to Anthropic's batch API at half the price, and the answers are
-- collected when the batch ends (usually within the hour, at most a day).
--
-- A row lasts from the moment a batch is sent until its answers are saved.
-- `items` says what each request in it was for, by the id it was sent under.

create table public.ai_batches (
  workspace_id text not null references public.workspaces on delete cascade,
  -- The provider's id for the batch.
  id text not null check (char_length(id) between 1 and 200),
  -- What it reads: 'tickets'.
  kind text not null check (char_length(kind) between 1 and 50),
  model text not null check (char_length(model) between 1 and 100),
  items jsonb not null,
  submitted_at timestamptz not null,
  primary key (workspace_id, id)
);

alter table public.ai_batches enable row level security;

create policy tenant on public.ai_batches for all to dossier_app
  using (workspace_id = current_setting('app.workspace_id', true))
  with check (workspace_id = current_setting('app.workspace_id', true));

grant select, insert, update, delete on public.ai_batches to dossier_app;

-- For the collector, which looks across workspaces: where a batch is out,
-- and nothing else.
create function public.ai_batch_workspaces()
returns table (workspace_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct b.workspace_id from public.ai_batches b
$$;

revoke execute on function public.ai_batch_workspaces() from public;
grant execute on function public.ai_batch_workspaces() to dossier_app;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.ai_batches from anon, authenticated;
    revoke execute on function public.ai_batch_workspaces() from anon, authenticated;
    grant execute on function public.ai_batch_workspaces() to service_role;
  end if;
end
$$;
