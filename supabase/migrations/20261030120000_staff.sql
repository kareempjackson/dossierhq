-- Dossier's own staff, who run the platform from the admin app. They aren't
-- people in a workspace: their own accounts, sessions, invites and log, and
-- two-factor is always on. Like sessions, only SHA-256s of tokens are stored.

create table public.staff_users (
  id text primary key,
  email text not null unique check (email = lower(email)),
  name text not null check (char_length(name) between 1 and 100),
  role text not null check (role in ('support', 'admin')),
  password_hash text not null,
  -- Sealed with CONNECTOR_SECRET_KEY, like users' two-factor secrets.
  totp_secret text not null,
  -- The last 30-second step a code was used for, so each code works once.
  totp_last_step bigint,
  -- SHA-256 of each recovery code not yet used.
  recovery_hashes text[] not null default '{}',
  created_at timestamptz not null,
  -- Set when their access is taken away; kept so the log still names them.
  disabled_at timestamptz
);

create table public.staff_sessions (
  token_hash text primary key,
  staff_id text not null references public.staff_users on delete cascade,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null
);
create index staff_sessions_staff_idx on public.staff_sessions (staff_id);
create index staff_sessions_expires_idx on public.staff_sessions (expires_at);

create table public.staff_invites (
  id text primary key,
  email text not null unique check (email = lower(email)),
  role text not null check (role in ('support', 'admin')),
  token_hash text not null unique,
  -- Null when it came from the command line, or its sender has gone.
  invited_by text references public.staff_users on delete set null,
  invited_by_name text not null,
  created_at timestamptz not null,
  expires_at timestamptz not null
);

-- What staff did. Not tied to workspaces by foreign key, so it outlives them.
create table public.staff_audit (
  id text primary key,
  at timestamptz not null,
  -- Null when it came from the command line.
  staff_id text references public.staff_users on delete set null,
  staff_name text,
  staff_email text,
  what text not null check (char_length(what) between 1 and 1000),
  workspace_id text,
  user_id text,
  outcome text not null check (outcome in ('ok', 'failed')),
  ip text
);
create index staff_audit_at_idx on public.staff_audit (at desc, id);
create index staff_audit_workspace_idx on public.staff_audit (workspace_id, at desc);

alter table public.staff_users enable row level security;
alter table public.staff_sessions enable row level security;
alter table public.staff_invites enable row level security;
alter table public.staff_audit enable row level security;

-- None of these belong to a workspace; only the API's /admin routes use them.
create policy staff on public.staff_users for all to dossier_app
  using (true) with check (true);
create policy staff on public.staff_sessions for all to dossier_app
  using (true) with check (true);
create policy staff on public.staff_invites for all to dossier_app
  using (true) with check (true);
create policy staff on public.staff_audit for all to dossier_app
  using (true) with check (true);

-- Accepts a staff invite: creates p_staff with the invite's email and role,
-- and deletes the invite, at once. Returns 'accepted'; 'invalid' when the
-- token is unknown or expired; 'taken' when the email is already staff.
create function public.accept_staff_invite(
  p_token_hash text,
  p_staff jsonb,
  p_now timestamptz
) returns text
language plpgsql
set search_path = ''
as $$
declare
  v_invite public.staff_invites;
begin
  -- Locks the invite, so of two people accepting at once only one gets it.
  select * into v_invite from public.staff_invites
  where token_hash = p_token_hash and expires_at > p_now
  for update;
  if not found then
    return 'invalid';
  end if;

  begin
    insert into public.staff_users
    select * from jsonb_populate_record(
      null::public.staff_users,
      p_staff || jsonb_build_object('email', v_invite.email, 'role', v_invite.role)
    );
  exception when unique_violation then
    return 'taken';
  end;
  delete from public.staff_invites where id = v_invite.id;
  return 'accepted';
end;
$$;

-- Marks a time step used, so a code can't be replayed; false when that step
-- or a later one already was, or they've been disabled.
create function public.use_staff_step(p_staff_id text, p_step bigint)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.staff_users set totp_last_step = p_step
  where id = p_staff_id
    and disabled_at is null
    and (totp_last_step is null or totp_last_step < p_step);
  return found;
end;
$$;

-- Uses up a recovery code; false when it isn't one of theirs (any more).
create function public.use_staff_recovery_code(p_staff_id text, p_hash text)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.staff_users
  set recovery_hashes = array_remove(recovery_hashes, p_hash)
  where id = p_staff_id
    and disabled_at is null
    and p_hash = any (recovery_hashes);
  return found;
end;
$$;

revoke execute on function public.accept_staff_invite(text, jsonb, timestamptz) from public;
revoke execute on function public.use_staff_step(text, bigint) from public;
revoke execute on function public.use_staff_recovery_code(text, text) from public;
grant execute on function public.accept_staff_invite(text, jsonb, timestamptz) to dossier_app;
grant execute on function public.use_staff_step(text, bigint) to dossier_app;
grant execute on function public.use_staff_recovery_code(text, text) to dossier_app;

-- Supabase's browser roles must never reach staff accounts: the password
-- hashes and sealed secrets are here.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.staff_users from anon, authenticated;
    revoke all on public.staff_sessions from anon, authenticated;
    revoke all on public.staff_invites from anon, authenticated;
    revoke all on public.staff_audit from anon, authenticated;
    revoke execute on function public.accept_staff_invite(text, jsonb, timestamptz)
      from anon, authenticated;
    revoke execute on function public.use_staff_step(text, bigint) from anon, authenticated;
    revoke execute on function public.use_staff_recovery_code(text, text)
      from anon, authenticated;
    grant execute on function public.accept_staff_invite(text, jsonb, timestamptz)
      to service_role;
    grant execute on function public.use_staff_step(text, bigint) to service_role;
    grant execute on function public.use_staff_recovery_code(text, text) to service_role;
  end if;
end
$$;
