-- Plain, portable Postgres: this schema backs both the `supabase` and the
-- `postgres` adapters, and applies to any Postgres 13+.

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_created_at_id_idx on public.notes (created_at desc, id desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger notes_set_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

-- All reads and writes go through the API with server-side credentials, so the
-- browser-facing roles get no access. Add policies here if that ever changes.
alter table public.notes enable row level security;
