-- PostgREST stops a call after its authenticator role's statement_timeout:
-- 8 seconds. A sync saves a tool's records in one call, and on the live
-- database a busy moment could push that past 8 seconds and fail the sync.
--
-- The API's server-side calls run as service_role, and PostgREST (12 and
-- later) applies the settings of the role it switches to, so that role gets
-- 30 seconds. anon and authenticated keep their tighter limits.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    alter role service_role set statement_timeout = '30s';
  end if;
end
$$;

-- PostgREST reads role settings when it reloads its configuration.
notify pgrst, 'reload config';
