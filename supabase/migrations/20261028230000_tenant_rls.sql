-- Tenant isolation the database enforces. The API can connect as
-- dossier_app, a role that row level security applies to: each request runs
-- in a transaction that sets app.workspace_id, and every row of a tenant
-- table must belong to that workspace to be read or written. A query that
-- forgets its workspace filter, or a transaction that never sets one, sees
-- nothing of anyone else's.
--
-- The owner (postgres) and Supabase's service_role still bypass this, which
-- is how the Supabase Data API adapter keeps working; it isn't protected by
-- these policies. To use dossier_app, give it a password:
--   alter role dossier_app with password '...';
-- and point DATABASE_URL at it with DATABASE_PROVIDER=postgres.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'dossier_app') then
    create role dossier_app login noinherit nobypassrls;
  end if;
end
$$;

grant usage on schema public to dossier_app;
grant select, insert, update, delete on all tables in schema public to dossier_app;
grant usage, select on all sequences in schema public to dossier_app;
alter default privileges in schema public
  grant select, insert, update, delete on tables to dossier_app;
alter default privileges in schema public
  grant usage, select on sequences to dossier_app;

-- Every row of these belongs to one workspace.
do $$
declare
  t text;
begin
  foreach t in array array[
    'attention_items', 'audit_entries', 'client_links', 'client_views',
    'clients', 'commitments', 'connectors', 'devices', 'intelligence_runs',
    'invites', 'meetings', 'recommendations', 'report_questions', 'reports',
    'sources', 'tickets'
  ] loop
    execute format(
      'create policy tenant on public.%I for all to dossier_app
         using (workspace_id = current_setting(''app.workspace_id'', true))
         with check (workspace_id = current_setting(''app.workspace_id'', true))',
      t
    );
  end loop;
end
$$;

create policy tenant on public.workspaces for all to dossier_app
  using (id = current_setting('app.workspace_id', true))
  with check (id = current_setting('app.workspace_id', true));

-- Signing in comes before there is a workspace: finding the user by email,
-- their memberships, their session by token. These hold accounts, not a
-- workspace's records, so the API's role may use them whole.
do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'workspace_members', 'sessions', 'password_resets',
    'rate_limit_hits'
  ] loop
    execute format(
      'create policy sign_in on public.%I for all to dossier_app
         using (true) with check (true)',
      t
    );
  end loop;
end
$$;

-- The few reads that must cross workspaces, each narrowed to what it needs.

-- For the sync scheduler: which tools are connected where, and nothing else.
create function public.connected_tools()
returns table (workspace_id text, tool text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.workspace_id, c.tool from public.connectors c
$$;

-- For the invite page: the one invite a link's token belongs to.
create function public.find_invite(p_token_hash text)
returns setof public.invites
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.invites where token_hash = p_token_hash
$$;

-- Accepting reads the invite before anyone is in its workspace.
alter function public.accept_invite(text, jsonb, timestamptz) security definer;

revoke execute on function public.connected_tools() from public;
revoke execute on function public.find_invite(text) from public;

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace
  loop
    execute format('grant execute on function %s to dossier_app', f);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.connected_tools() from anon, authenticated;
    revoke execute on function public.find_invite(text) from anon, authenticated;
    grant execute on function public.connected_tools() to service_role;
    grant execute on function public.find_invite(text) to service_role;
  end if;
end
$$;
alter default privileges in schema public
  grant execute on functions to dossier_app;
