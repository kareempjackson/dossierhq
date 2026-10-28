-- Inviting people to a workspace. An invite is a link, emailed, that works
-- for 7 days; like sessions, only a SHA-256 of its token is stored. Inviting
-- the same email again replaces the invite. Accepted and withdrawn invites
-- are deleted: the audit log keeps what happened.

create table public.invites (
  id text primary key,
  workspace_id text not null references public.workspaces on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('admin', 'technician')),
  token_hash text not null unique,
  invited_by text references public.users on delete set null,
  -- Kept as it was, so the invite still says who sent it.
  invited_by_name text not null,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  unique (workspace_id, email)
);
create index invites_workspace_idx on public.invites (workspace_id, created_at desc);

alter table public.invites enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.invites from anon, authenticated;
  end if;
end
$$;

-- Accepts an invite: creates p_user with the invite's email, adds them to the
-- workspace with the invite's role, and deletes the invite, all at once.
-- Returns 'accepted'; 'invalid' when the token is unknown or expired; 'taken'
-- when the email already has an account (the invite is kept).
create function public.accept_invite(
  p_token_hash text,
  p_user jsonb,
  p_now timestamptz
) returns text
language plpgsql
set search_path = ''
as $$
declare
  v_invite public.invites;
begin
  -- Locks the invite, so of two people accepting at once only one gets it.
  select * into v_invite from public.invites
  where token_hash = p_token_hash and expires_at > p_now
  for update;
  if not found then
    return 'invalid';
  end if;

  begin
    insert into public.users
    select * from jsonb_populate_record(
      null::public.users,
      p_user || jsonb_build_object('email', v_invite.email)
    );
  exception when unique_violation then
    return 'taken';
  end;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_invite.workspace_id, p_user ->> 'id', v_invite.role);
  delete from public.invites where id = v_invite.id;
  return 'accepted';
end;
$$;

-- Removes someone from a workspace and ends their sessions there. Everyone
-- belongs to one workspace for now, so someone left in none has their account
-- removed too, and can be invited again. False when they weren't a member.
create function public.remove_member(
  p_workspace_id text,
  p_user_id text
) returns boolean
language plpgsql
set search_path = ''
as $$
begin
  delete from public.workspace_members
  where workspace_id = p_workspace_id and user_id = p_user_id;
  if not found then
    return false;
  end if;
  delete from public.sessions
  where workspace_id = p_workspace_id and user_id = p_user_id;
  delete from public.users u
  where u.id = p_user_id
    and not exists (
      select 1 from public.workspace_members m where m.user_id = u.id
    );
  return true;
end;
$$;

revoke execute on function public.accept_invite(text, jsonb, timestamptz) from public;
revoke execute on function public.remove_member(text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.accept_invite(text, jsonb, timestamptz)
      from anon, authenticated;
    revoke execute on function public.remove_member(text, text)
      from anon, authenticated;
    grant execute on function public.accept_invite(text, jsonb, timestamptz)
      to service_role;
    grant execute on function public.remove_member(text, text)
      to service_role;
  end if;
end
$$;
