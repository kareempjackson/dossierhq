-- Every signed-in request asked three things in three round trips: the
-- session, the account's onboarding, and whether two-factor sign-in is on.
-- find_session now answers all three, so a request costs one.
--
-- The new columns come last, so an API still on the old code reads the ones
-- it knows and ignores the rest.

drop function public.find_session(text);

create function public.find_session(p_token_hash text)
returns table (
  token_hash text,
  user_id text,
  workspace_id text,
  created_at timestamptz,
  expires_at timestamptz,
  last_seen_at timestamptz,
  workspace_suspended boolean,
  -- How far the account's setup has got (see users.setup in the adapters).
  onboarded_at timestamptz,
  two_factor_required boolean,
  enabled_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.token_hash, s.user_id, s.workspace_id, s.created_at, s.expires_at,
    s.last_seen_at, w.suspended_at is not null,
    u.onboarded_at, u.two_factor_required, m.enabled_at
  from public.sessions s
  join public.workspaces w on w.id = s.workspace_id
  join public.users u on u.id = s.user_id
  left join public.user_mfa m on m.user_id = s.user_id
  where s.token_hash = p_token_hash
$$;

revoke execute on function public.find_session(text) from public;
grant execute on function public.find_session(text) to dossier_app;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.find_session(text) from anon, authenticated;
    grant execute on function public.find_session(text) to service_role;
  end if;
end
$$;
