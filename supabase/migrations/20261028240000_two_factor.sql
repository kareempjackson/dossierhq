-- Two-factor sign-in with an authenticator app (TOTP). The secret is stored
-- encrypted with CONNECTOR_SECRET_KEY; recovery codes only as SHA-256.

create table public.user_mfa (
  user_id text primary key references public.users on delete cascade,
  -- Sealed with CONNECTOR_SECRET_KEY, like connector credentials.
  secret text not null,
  -- Null while setting up; set once a code from the app has been checked.
  enabled_at timestamptz,
  -- The last 30-second step a code was used for, so each code works once.
  last_step bigint,
  -- SHA-256 of each recovery code not yet used.
  recovery_hashes text[] not null default '{}',
  created_at timestamptz not null
);

alter table public.user_mfa enable row level security;

-- Part of signing in, before a workspace is known, like sessions.
create policy sign_in on public.user_mfa for all to dossier_app
  using (true) with check (true);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.user_mfa from anon, authenticated;
  end if;
end
$$;

-- Marks a time step used, so a code can't be replayed; false when that step
-- or a later one already was.
create function public.use_mfa_step(p_user_id text, p_step bigint)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.user_mfa set last_step = p_step
  where user_id = p_user_id
    and enabled_at is not null
    and (last_step is null or last_step < p_step);
  return found;
end;
$$;

-- Uses up a recovery code; false when it isn't one of theirs (any more).
create function public.use_recovery_code(p_user_id text, p_hash text)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.user_mfa
  set recovery_hashes = array_remove(recovery_hashes, p_hash)
  where user_id = p_user_id
    and enabled_at is not null
    and p_hash = any (recovery_hashes);
  return found;
end;
$$;

revoke execute on function public.use_mfa_step(text, bigint) from public;
revoke execute on function public.use_recovery_code(text, text) from public;
grant execute on function public.use_mfa_step(text, bigint) to dossier_app;
grant execute on function public.use_recovery_code(text, text) to dossier_app;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.use_mfa_step(text, bigint) from anon, authenticated;
    revoke execute on function public.use_recovery_code(text, text) from anon, authenticated;
    grant execute on function public.use_mfa_step(text, bigint) to service_role;
    grant execute on function public.use_recovery_code(text, text) to service_role;
  end if;
end
$$;
