-- Questions the MSP wants weekly reports to answer, such as "Is anyone still
-- on Windows 10?", for every client or for one. Dossier answers each from the
-- client's records when it drafts their report.

create table public.report_questions (
  id text primary key,
  workspace_id text not null references public.workspaces on delete cascade,
  -- Null asks it in every client's report.
  client_id text references public.clients on delete cascade,
  text text not null check (char_length(text) between 1 and 500),
  created_at timestamptz not null
);
create index report_questions_workspace_idx on public.report_questions (workspace_id, created_at);

-- As for every other table: only the API's server-side credentials get in.
alter table public.report_questions enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.report_questions from anon, authenticated;
  end if;
end
$$;
