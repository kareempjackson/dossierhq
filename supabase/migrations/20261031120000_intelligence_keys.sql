-- API keys workspaces bring for the models they draft with: Anthropic's,
-- OpenAI's, Google's or xAI's, at most one each. A workspace's own key is
-- used before Dossier's, and its provider bills the workspace directly.

create table public.intelligence_keys (
  workspace_id text not null references public.workspaces on delete cascade,
  provider text not null check (provider in ('anthropic', 'openai', 'google', 'xai')),
  -- AES-256-GCM ciphertext of the key (see the API's integrations/secrets.ts).
  -- The encryption key never reaches the database.
  secret text not null,
  -- The key's last four characters, so people can tell keys apart.
  hint text not null check (char_length(hint) <= 8),
  added_by text references public.users on delete set null,
  -- Kept as it was, so Settings still says who added it.
  added_by_name text not null,
  added_at timestamptz not null,
  primary key (workspace_id, provider)
);

alter table public.intelligence_keys enable row level security;
create policy tenant on public.intelligence_keys for all to dossier_app
  using (workspace_id = current_setting('app.workspace_id', true))
  with check (workspace_id = current_setting('app.workspace_id', true));

-- As for every other table: only the API's server-side credentials get in.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.intelligence_keys from anon, authenticated;
  end if;
end
$$;
