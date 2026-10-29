-- Questions typed into the Ask box, and Dossier's answers. Everyone in the
-- workspace can read them, so a link to one can be shared. Each keeps the
-- records it cites as they stood, like reports do, so its citations hold
-- after syncs change or drop them.

create table public.ask_answers (
  id text primary key,
  workspace_id text not null references public.workspaces on delete cascade,
  question text not null check (char_length(question) between 1 and 500),
  status text not null check (status in ('answering', 'answered', 'failed')),
  -- False when the records didn't show the answer; null until answered.
  answered boolean,
  asked_by text references public.users on delete set null,
  -- Kept as it was, so the answer still says who asked.
  asked_by_name text not null,
  -- The clients read, as [{id, name}]: they outlive the clients.
  clients jsonb not null default '[]',
  lines jsonb not null default '[]',
  sources jsonb not null default '[]',
  model text,
  cost double precision,
  error text,
  asked_at timestamptz not null,
  finished_at timestamptz
);
create index ask_answers_workspace_idx
  on public.ask_answers (workspace_id, asked_at desc);
create index ask_answers_asker_idx
  on public.ask_answers (workspace_id, asked_by, asked_at desc);

alter table public.ask_answers enable row level security;
create policy tenant on public.ask_answers for all to dossier_app
  using (workspace_id = current_setting('app.workspace_id', true))
  with check (workspace_id = current_setting('app.workspace_id', true));

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.ask_answers from anon, authenticated;
  end if;
end
$$;
