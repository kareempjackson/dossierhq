-- Sign-up by email and password, confirmed by a link, then onboarding.
--
-- A sign-up waits in sign_ups until its link is opened; only then do the
-- account and its workspace exist, so an address nobody confirmed never
-- holds an account. Like sessions and resets, only a SHA-256 of the link's
-- token is stored. Signing up again with the same email replaces the one
-- waiting, so only the newest link works.

create table public.sign_ups (
  token_hash text primary key,
  -- Stored lowercase, like users.email.
  email text not null check (email = lower(email)),
  password_hash text not null,
  -- SHA-256 of a key the browser that signed up keeps: opening the link
  -- there needs no password. Null when it sent none.
  browser_hash text,
  -- The browser's, for the workspace the link creates.
  time_zone text not null,
  created_at timestamptz not null,
  expires_at timestamptz not null
);
create unique index sign_ups_email_key on public.sign_ups (email);
create index sign_ups_expires_idx on public.sign_ups (expires_at);

alter table public.sign_ups enable row level security;

-- Before there is an account or a workspace, like password resets.
create policy sign_in on public.sign_ups for all to dossier_app
  using (true) with check (true);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.sign_ups from anon, authenticated;
  end if;
end
$$;

-- Null until someone finishes onboarding. Accounts from before it existed
-- count as done.
alter table public.users add column onboarded_at timestamptz;
update public.users set onboarded_at = created_at;

-- Set when someone finishes onboarding with two-factor on: from then on they
-- keep it on, and turning it off sends them to set it up again. Null means
-- no. Nullable, not NOT NULL, because accept_invite and create_owner fill
-- users from JSON, which leaves out what it doesn't name.
alter table public.users add column two_factor_required boolean;

-- What onboarding learned about the company beyond its name and time zone:
-- website, size, the tools it uses. Null until then. Nullable for the same
-- reason as above.
alter table public.workspaces add column profile jsonb;

-- Uses up a sign-up's link and creates its workspace, with the person as
-- owner, all at once. The email and password come from the sign-up, never
-- from the caller. 'invalid' when the link is unknown or expired by p_now;
-- 'taken' when the email has an account by now (the link is still used up).
create function public.complete_sign_up(
  p_token_hash text,
  p_workspace jsonb,
  p_user jsonb,
  p_now timestamptz
) returns text
language plpgsql
set search_path = ''
as $$
declare
  v_sign_up public.sign_ups;
begin
  -- One statement, so of two racing requests only one gets the row.
  delete from public.sign_ups
  where token_hash = p_token_hash and expires_at > p_now
  returning * into v_sign_up;
  if not found then
    return 'invalid';
  end if;

  -- Columns by name, unlike create_owner, so the rest take their defaults.
  begin
    insert into public.users (id, email, name, title, password_hash, created_at)
    values (
      p_user ->> 'id',
      v_sign_up.email,
      p_user ->> 'name',
      coalesce(p_user ->> 'title', ''),
      v_sign_up.password_hash,
      p_now
    );
  exception when unique_violation then
    return 'taken';
  end;
  insert into public.workspaces (id, name, time_zone)
  values (p_workspace ->> 'id', p_workspace ->> 'name', p_workspace ->> 'time_zone');
  insert into public.workspace_members (workspace_id, user_id, role)
  values (p_workspace ->> 'id', p_user ->> 'id', 'owner');
  return 'created';
end;
$$;

-- Only the API's server-side credentials may call it.
revoke execute on function public.complete_sign_up(text, jsonb, jsonb, timestamptz)
  from public;
grant execute on function public.complete_sign_up(text, jsonb, jsonb, timestamptz)
  to dossier_app;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.complete_sign_up(text, jsonb, jsonb, timestamptz)
      from anon, authenticated;
    grant execute on function public.complete_sign_up(text, jsonb, jsonb, timestamptz)
      to service_role;
  end if;
end
$$;
