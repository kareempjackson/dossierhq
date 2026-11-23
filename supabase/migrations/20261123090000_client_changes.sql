-- Which clients' records changed, and how far each piece of background work
-- has got with each client. Until now nothing recorded what a sync changed,
-- so after every sync the AI pass loaded every client's tickets, sources and
-- notes to find out whether there was anything to do: usually there wasn't.
--
-- A sync notes the clients whose records it changed (client_changes). Each
-- step of the pass notes when it last finished with a client (pass_marks),
-- and looks only at clients changed since. A client id of '' stands for
-- records filed under no client.

create table public.client_changes (
  workspace_id text not null references public.workspaces on delete cascade,
  client_id text not null check (char_length(client_id) <= 200),
  changed_at timestamptz not null,
  primary key (workspace_id, client_id)
);

create table public.pass_marks (
  workspace_id text not null references public.workspaces on delete cascade,
  -- The step: 'memory', 'tickets', 'people', 'clients'.
  pass text not null check (char_length(pass) between 1 and 50),
  client_id text not null check (char_length(client_id) <= 200),
  -- Changes up to here are dealt with.
  done_through timestamptz not null,
  primary key (workspace_id, pass, client_id)
);

alter table public.client_changes enable row level security;
alter table public.pass_marks enable row level security;

create policy tenant on public.client_changes for all to dossier_app
  using (workspace_id = current_setting('app.workspace_id', true))
  with check (workspace_id = current_setting('app.workspace_id', true));
create policy tenant on public.pass_marks for all to dossier_app
  using (workspace_id = current_setting('app.workspace_id', true))
  with check (workspace_id = current_setting('app.workspace_id', true));

grant select, insert, update, delete on public.client_changes, public.pass_marks
  to dossier_app;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.client_changes, public.pass_marks from anon, authenticated;
  end if;
end
$$;
