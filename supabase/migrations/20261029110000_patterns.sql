-- Patterns Claude found across a workspace's clients: the same problem at
-- several of them, or a risk building up. Each run replaces them all. The
-- clients a pattern names live in its JSON, not a foreign key, so removing
-- a client leaves the pattern for the API to trim.

create table public.patterns (
  id text primary key,
  workspace_id text not null references public.workspaces on delete cascade,
  position integer not null,
  title text not null,
  why text not null,
  suggestion text not null,
  -- [{clientId, detail, sourceIds}], two or more.
  clients jsonb not null,
  created_at timestamptz not null
);
create index patterns_workspace_idx on public.patterns (workspace_id, position);

alter table public.patterns enable row level security;
create policy tenant on public.patterns for all to dossier_app
  using (workspace_id = current_setting('app.workspace_id', true))
  with check (workspace_id = current_setting('app.workspace_id', true));

-- Swaps every pattern for these at once. Both SQL adapters call it.
create function public.replace_patterns(
  p_workspace_id text,
  p_patterns jsonb
) returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.patterns where workspace_id = p_workspace_id;
  insert into public.patterns
  select * from jsonb_populate_recordset(null::public.patterns, p_patterns) p
  where p.workspace_id = p_workspace_id;
end;
$$;

revoke execute on function public.replace_patterns(text, jsonb) from public;
grant execute on function public.replace_patterns(text, jsonb) to dossier_app;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.patterns from anon, authenticated;
    revoke execute on function public.replace_patterns(text, jsonb)
      from anon, authenticated;
    grant execute on function public.replace_patterns(text, jsonb) to service_role;
  end if;
end
$$;
