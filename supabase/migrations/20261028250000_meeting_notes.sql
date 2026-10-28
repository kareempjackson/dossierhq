-- Meeting notes people add themselves, for meetings Fathom didn't record:
-- pasted in, or forwarded by email to the workspace's notes address. Notes
-- no client claims wait in the inbox (client_id null) for someone to file.
-- They're people's own words, so no sync ever deletes them: notes whose
-- client goes away return to the inbox.

-- Left over from the starter app's notes table, dropped in 20261011090000.
drop function if exists public.set_updated_at();

create table public.meeting_notes (
  id text primary key,
  workspace_id text not null references public.workspaces on delete cascade,
  client_id text references public.clients on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  occurred_on date not null,
  attendees text[] not null default '{}',
  body text not null check (char_length(body) between 1 and 50000),
  via text not null check (via in ('paste', 'email')),
  added_by text references public.users on delete set null,
  -- Kept as it was, so the notes still say who added them.
  added_by_name text not null,
  created_at timestamptz not null
);
create index meeting_notes_client_idx
  on public.meeting_notes (workspace_id, client_id, occurred_on desc);

-- Each workspace's address for forwarding notes: its token goes after the +
-- of the inbound address, e.g. notes+<token>@inbound.example.
create table public.notes_inboxes (
  workspace_id text primary key references public.workspaces on delete cascade,
  token text not null unique,
  created_at timestamptz not null
);

alter table public.meeting_notes enable row level security;
alter table public.notes_inboxes enable row level security;

create policy tenant on public.meeting_notes for all to dossier_app
  using (workspace_id = current_setting('app.workspace_id', true))
  with check (workspace_id = current_setting('app.workspace_id', true));
create policy tenant on public.notes_inboxes for all to dossier_app
  using (workspace_id = current_setting('app.workspace_id', true))
  with check (workspace_id = current_setting('app.workspace_id', true));

-- Forwarded email arrives before its workspace is known: the one workspace
-- an address's token belongs to.
create function public.notes_inbox_workspace(p_token text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select workspace_id from public.notes_inboxes where token = p_token
$$;

revoke execute on function public.notes_inbox_workspace(text) from public;
grant execute on function public.notes_inbox_workspace(text) to dossier_app;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.meeting_notes from anon, authenticated;
    revoke all on public.notes_inboxes from anon, authenticated;
    revoke execute on function public.notes_inbox_workspace(text)
      from anon, authenticated;
    grant execute on function public.notes_inbox_workspace(text)
      to service_role;
  end if;
end
$$;
