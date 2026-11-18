-- People who asked for news about Dossier from the public site's footer.
--
-- Nothing is sent yet; this only keeps the list. An address is stored once,
-- lowercased: signing up again changes nothing, so the first sign-up's page
-- and time stay as they were.

create table public.product_update_signups (
  email text primary key check (email = lower(email) and length(email) <= 320),
  -- The page they signed up on, e.g. /welcome. Null when it wasn't known.
  source text check (source is null or length(source) <= 200),
  created_at timestamptz not null
);

alter table public.product_update_signups enable row level security;

-- Before there is any account or workspace, like sign_ups.
create policy public_site on public.product_update_signups for all to dossier_app
  using (true) with check (true);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.product_update_signups from anon, authenticated;
  end if;
end
$$;
