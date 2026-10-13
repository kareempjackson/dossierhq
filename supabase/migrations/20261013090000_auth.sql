-- Sign-in for Dossier: users, their workspace memberships and sessions.
-- Passwords are scrypt hashes (see apps/api/src/auth/password.ts). Sessions
-- keep only a SHA-256 of the token, so a database leak can't be replayed.

create table public.users (
  id text primary key,
  -- Stored lowercase, so lookups are exact matches (no pattern wildcards).
  email text not null check (email = lower(email)),
  name text not null,
  title text not null default '',
  password_hash text not null,
  created_at timestamptz not null default now()
);
create unique index users_email_key on public.users (email);

create table public.workspace_members (
  workspace_id text not null references public.workspaces on delete cascade,
  user_id text not null references public.users on delete cascade,
  role text not null check (role in ('owner', 'member')),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

create table public.sessions (
  token_hash text primary key,
  user_id text not null references public.users on delete cascade,
  workspace_id text not null references public.workspaces on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user_idx on public.sessions (user_id);
create index sessions_expires_idx on public.sessions (expires_at);

-- Who is signed in now comes from the session, not the workspace row.
alter table public.workspaces drop column user_name, drop column user_role;

alter table public.users enable row level security;
alter table public.workspace_members enable row level security;
alter table public.sessions enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.users, public.workspace_members, public.sessions
      from anon, authenticated;
  end if;
end
$$;
