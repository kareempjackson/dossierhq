-- Rate limits, kept in the database so they hold across restarts and API
-- instances: each row is one attempt against a limit, such as a failed
-- sign-in for an email or from an address. Buckets hold a SHA-256 of the
-- email or address, never the thing itself. Rows older than a day are
-- pruned; no limit looks further back.

create table public.rate_limit_hits (
  id bigint generated always as identity primary key,
  -- e.g. 'sign-in-email:<sha256>'
  bucket text not null,
  at timestamptz not null
);
create index rate_limit_hits_bucket_idx on public.rate_limit_hits (bucket, at);
create index rate_limit_hits_at_idx on public.rate_limit_hits (at);

alter table public.rate_limit_hits enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.rate_limit_hits from anon, authenticated;
  end if;
end
$$;

-- Where a sign-in came from, when the web app passed the visitor's address on.
alter table public.audit_entries add column ip text;
