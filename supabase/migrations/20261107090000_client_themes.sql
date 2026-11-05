-- Recurring issues at each client: trouble that keeps coming back, found by
-- the reading model in what Dossier read off the last 90 days of tickets.
-- Each rests on two tickets or more. A client's are replaced together.

create table public.client_themes (
  workspace_id text not null references public.workspaces on delete cascade,
  id text not null,
  client_id text not null references public.clients on delete cascade,
  position integer not null,
  -- The theme, as packages/contracts ClientTheme.
  theme jsonb not null,
  created_at timestamptz not null,
  primary key (workspace_id, id)
);
create index client_themes_client_idx
  on public.client_themes (workspace_id, client_id, position);

alter table public.client_themes enable row level security;
create policy tenant on public.client_themes for all to dossier_app
  using (workspace_id = current_setting('app.workspace_id', true))
  with check (workspace_id = current_setting('app.workspace_id', true));

-- Swaps a client's themes for these at once. Both SQL adapters call it.
create function public.replace_client_themes(
  p_workspace_id text,
  p_client_id text,
  p_themes jsonb
) returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.client_themes
  where workspace_id = p_workspace_id and client_id = p_client_id;
  insert into public.client_themes (workspace_id, id, client_id, position, theme, created_at)
  select p_workspace_id, t ->> 'id', p_client_id, (ordinality - 1)::integer, t,
    (t ->> 'createdAt')::timestamptz
  from jsonb_array_elements(coalesce(p_themes, '[]')) with ordinality as x(t, ordinality);
end;
$$;

revoke execute on function public.replace_client_themes(text, text, jsonb) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'dossier_app') then
    grant execute on function public.replace_client_themes(text, text, jsonb) to dossier_app;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.client_themes from anon, authenticated;
    revoke execute on function public.replace_client_themes(text, text, jsonb)
      from anon, authenticated;
    grant execute on function public.replace_client_themes(text, text, jsonb)
      to service_role;
  end if;
end
$$;
