-- What Dossier's staff need to look after workspaces: when each began,
-- suspending one, and the few reads that cross workspaces for the admin
-- app, each a narrow security definer function like connected_tools().

-- When the workspace was made. Existing ones take their owner's sign-up.
alter table public.workspaces add column created_at timestamptz;
update public.workspaces w set created_at = coalesce(
  (select min(u.created_at) from public.workspace_members m
   join public.users u on u.id = m.user_id
   where m.workspace_id = w.id),
  now()
);
alter table public.workspaces
  alter column created_at set default now(),
  alter column created_at set not null;

-- A suspended workspace can't be signed in to, and nothing syncs, drafts or
-- sends for it, until staff restore it. Its data stays as it was.
alter table public.workspaces
  add column suspended_at timestamptz,
  add column suspended_reason text
    check (char_length(suspended_reason) between 1 and 500),
  add constraint workspaces_suspension_check
    check ((suspended_at is null) = (suspended_reason is null));

-- create_owner builds the row with jsonb_populate_record, which ignores
-- column defaults, so it fills created_at itself when it isn't given.
create or replace function public.create_owner(
  p_workspace jsonb,
  p_user jsonb
) returns boolean
language plpgsql
set search_path = ''
as $$
begin
  insert into public.users
  select * from jsonb_populate_record(null::public.users, p_user)
  on conflict (email) do nothing;
  if not found then
    return false;
  end if;
  insert into public.workspaces
  select * from jsonb_populate_record(
    null::public.workspaces,
    p_workspace || jsonb_build_object(
      'created_at', coalesce(p_workspace ->> 'created_at', now()::text)
    )
  );
  insert into public.workspace_members (workspace_id, user_id, role)
  values (p_workspace ->> 'id', p_user ->> 'id', 'owner');
  return true;
end;
$$;

-- Syncs skip suspended workspaces.
create or replace function public.connected_tools()
returns table (workspace_id text, tool text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.workspace_id, c.tool from public.connectors c
  join public.workspaces w on w.id = c.workspace_id
  where w.suspended_at is null
$$;

-- For signing in on every request: the session, and whether its workspace
-- is suspended. A join can't do this as dossier_app: before the workspace is
-- known, row level security hides every workspace row.
create function public.find_session(p_token_hash text)
returns table (
  token_hash text,
  user_id text,
  workspace_id text,
  created_at timestamptz,
  expires_at timestamptz,
  last_seen_at timestamptz,
  workspace_suspended boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.token_hash, s.user_id, s.workspace_id, s.created_at, s.expires_at,
    s.last_seen_at, w.suspended_at is not null
  from public.sessions s
  join public.workspaces w on w.id = s.workspace_id
  where s.token_hash = p_token_hash
$$;

-- For the admin app: workspaces with what staff look at first, newest
-- first. `p_query` matches the name, the ID, or a member's email; `p_status`
-- is 'active', 'suspended' or null for both; `p_id` picks one. `total` is
-- how many match before the page is cut.
create function public.platform_workspaces(
  p_query text default null,
  p_status text default null,
  p_id text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id text,
  name text,
  time_zone text,
  created_at timestamptz,
  suspended_at timestamptz,
  suspended_reason text,
  owner_name text,
  owner_email text,
  members integer,
  clients integer,
  connectors integer,
  failing_connectors integer,
  last_active_at timestamptz,
  total bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.name, w.time_zone, w.created_at, w.suspended_at,
    w.suspended_reason, o.name, o.email,
    (select count(*)::int from public.workspace_members m
     where m.workspace_id = w.id),
    (select count(*)::int from public.clients c where c.workspace_id = w.id),
    (select count(*)::int from public.connectors c where c.workspace_id = w.id),
    (select count(*)::int from public.connectors c
     where c.workspace_id = w.id and c.status = 'failing'),
    (select max(s.last_seen_at) from public.sessions s
     where s.workspace_id = w.id),
    count(*) over ()
  from public.workspaces w
  left join lateral (
    select u.name, u.email from public.workspace_members m
    join public.users u on u.id = m.user_id
    where m.workspace_id = w.id and m.role = 'owner'
    order by u.created_at, u.id collate "C"
    limit 1
  ) o on true
  where (p_id is null or w.id = p_id)
    and (p_status is null
      or (p_status = 'suspended') = (w.suspended_at is not null))
    and (p_query is null
      or strpos(lower(w.name), lower(p_query)) > 0
      or strpos(lower(w.id), lower(p_query)) > 0
      or exists (
        select 1 from public.workspace_members m
        join public.users u on u.id = m.user_id
        where m.workspace_id = w.id and strpos(u.email, lower(p_query)) > 0
      ))
  order by w.created_at desc, w.id collate "C"
  limit p_limit offset p_offset
$$;

-- For the admin app: people, with their workspace and how they sign in, by
-- name. `p_query` matches a name or email; `p_workspace_id` and `p_user_id`
-- narrow it to one workspace's people, or one person.
create function public.platform_people(
  p_query text default null,
  p_workspace_id text default null,
  p_user_id text default null,
  p_limit integer default 50
)
returns table (
  id text,
  email text,
  name text,
  title text,
  created_at timestamptz,
  workspace_id text,
  workspace_name text,
  role text,
  two_factor boolean,
  last_seen_at timestamptz,
  sessions integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email, u.name, u.title, u.created_at, m.workspace_id,
    w.name, m.role,
    exists (select 1 from public.user_mfa f
            where f.user_id = u.id and f.enabled_at is not null),
    (select max(s.last_seen_at) from public.sessions s where s.user_id = u.id),
    (select count(*)::int from public.sessions s
     where s.user_id = u.id and s.expires_at > now())
  from public.users u
  left join public.workspace_members m on m.user_id = u.id
  left join public.workspaces w on w.id = m.workspace_id
  where (p_user_id is null or u.id = p_user_id)
    and (p_workspace_id is null or m.workspace_id = p_workspace_id)
    and (p_query is null
      or strpos(u.email, lower(p_query)) > 0
      or strpos(lower(u.name), lower(p_query)) > 0)
  order by u.name collate "C", u.id collate "C"
  limit p_limit
$$;

-- Deletes a workspace and everything in it (its tables cascade), then the
-- accounts left in no workspace, so those people can sign up again. Runs
-- in the workspace's own transaction, like remove_member. False when there
-- was no such workspace.
create function public.delete_workspace(p_workspace_id text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_members text[];
begin
  select coalesce(array_agg(user_id), '{}') into v_members
  from public.workspace_members where workspace_id = p_workspace_id;
  delete from public.workspaces where id = p_workspace_id;
  if not found then
    return false;
  end if;
  delete from public.users u
  where u.id = any (v_members)
    and not exists (
      select 1 from public.workspace_members m where m.user_id = u.id
    );
  return true;
end;
$$;

revoke execute on function public.find_session(text) from public;
revoke execute on function public.platform_workspaces(text, text, text, integer, integer)
  from public;
revoke execute on function public.platform_people(text, text, text, integer) from public;
revoke execute on function public.delete_workspace(text) from public;
grant execute on function public.find_session(text) to dossier_app;
grant execute on function public.platform_workspaces(text, text, text, integer, integer)
  to dossier_app;
grant execute on function public.platform_people(text, text, text, integer)
  to dossier_app;
grant execute on function public.delete_workspace(text) to dossier_app;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.find_session(text) from anon, authenticated;
    revoke execute on function public.platform_workspaces(text, text, text, integer, integer)
      from anon, authenticated;
    revoke execute on function public.platform_people(text, text, text, integer)
      from anon, authenticated;
    revoke execute on function public.delete_workspace(text) from anon, authenticated;
    grant execute on function public.find_session(text) to service_role;
    grant execute on function public.platform_workspaces(text, text, text, integer, integer)
      to service_role;
    grant execute on function public.platform_people(text, text, text, integer)
      to service_role;
    grant execute on function public.delete_workspace(text) to service_role;
  end if;
end
$$;
