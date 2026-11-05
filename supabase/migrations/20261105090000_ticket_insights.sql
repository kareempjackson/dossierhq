-- What Dossier read off each ticket's whole conversation: what went wrong,
-- what was tried, how it was fixed, what's still owed. Read on the reading
-- model, a cheaper one than drafting, since every ticket is read.
--
-- A read hangs off the ticket's memory, not the tickets table syncs replace,
-- so it outlives the sync window as memory does, and goes when memory forgets
-- the ticket (its tool disconnected, its client gone, tickets unshared).

-- The model that reads tickets and people; null follows the provider's cheapest.
alter table public.workspaces add column intelligence_reading_model text;

create table public.ticket_insights (
  workspace_id text not null references public.workspaces on delete cascade,
  ticket_id text not null,
  document_id text not null,
  client_id text not null references public.clients on delete cascade,
  -- A hash of what was read; unchanged, the ticket isn't read again.
  input_hash text not null,
  status text not null check (status in ('ok', 'failed')),
  model text,
  -- Internal notes were read too, so it goes if they stop being shared.
  with_internal boolean not null default false,
  -- The read, as packages/contracts TicketInsight; null when it failed.
  insight jsonb,
  error text,
  attempted_at timestamptz not null,
  read_at timestamptz,
  primary key (workspace_id, ticket_id),
  foreign key (workspace_id, document_id)
    references public.memory_documents (workspace_id, id) on delete cascade
);
create index ticket_insights_client_idx
  on public.ticket_insights (workspace_id, client_id);

alter table public.ticket_insights enable row level security;
create policy tenant on public.ticket_insights for all to dossier_app
  using (workspace_id = current_setting('app.workspace_id', true))
  with check (workspace_id = current_setting('app.workspace_id', true));

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.ticket_insights from anon, authenticated;
  end if;
end
$$;
