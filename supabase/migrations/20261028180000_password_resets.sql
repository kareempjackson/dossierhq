-- Password resets by email. Like sessions, only a SHA-256 of the link's token
-- is stored. A reset works once, within its hour; asking again replaces any
-- unused one, so only the newest link works.

create table public.password_resets (
  token_hash text primary key,
  user_id text not null references public.users on delete cascade,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  used_at timestamptz
);
create index password_resets_user_idx on public.password_resets (user_id);

-- As for every other table: only the API's server-side credentials get in.
alter table public.password_resets enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.password_resets from anon, authenticated;
  end if;
end
$$;
