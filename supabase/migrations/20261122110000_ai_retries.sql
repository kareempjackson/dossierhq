-- What the AI couldn't read, and how often it has tried. A ticket (or
-- person, or meeting) whose read failed used to be tried again every hour
-- for ever: 18,900 failed ticket reads in ten days. Now each failure on the
-- same input waits twice as long as the last, and after a few it waits for
-- the input to change.
--
-- Kept apart from the reads themselves, so a failure never replaces the
-- last good read of a ticket.

create table public.ai_retries (
  workspace_id text not null references public.workspaces on delete cascade,
  -- Which reader: 'tickets', 'people', 'meetings'.
  kind text not null check (char_length(kind) between 1 and 50),
  -- What it couldn't read: a ticket id, a client and person, a meeting id.
  item_id text not null check (char_length(item_id) between 1 and 500),
  -- The input that failed. A different input starts the count again.
  input_hash text not null,
  attempts integer not null,
  attempted_at timestamptz not null,
  error text,
  primary key (workspace_id, kind, item_id)
);

alter table public.ai_retries enable row level security;

create policy tenant on public.ai_retries for all to dossier_app
  using (workspace_id = current_setting('app.workspace_id', true))
  with check (workspace_id = current_setting('app.workspace_id', true));

-- Notes a failed read and answers how many times this input has now failed.
create function public.note_ai_failure(
  p_workspace_id text,
  p_kind text,
  p_item_id text,
  p_input_hash text,
  p_at timestamptz,
  p_error text
) returns integer
language sql
set search_path = ''
as $$
  insert into public.ai_retries as r
    (workspace_id, kind, item_id, input_hash, attempts, attempted_at, error)
  values (p_workspace_id, p_kind, p_item_id, p_input_hash, 1, p_at, left(p_error, 500))
  on conflict (workspace_id, kind, item_id) do update set
    attempts = case when r.input_hash = excluded.input_hash
      then r.attempts + 1 else 1 end,
    input_hash = excluded.input_hash,
    attempted_at = excluded.attempted_at,
    error = excluded.error
  returning r.attempts
$$;

revoke execute on function public.note_ai_failure(text, text, text, text, timestamptz, text)
  from public;
grant execute on function public.note_ai_failure(text, text, text, text, timestamptz, text)
  to dossier_app;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.ai_retries from anon, authenticated;
    revoke execute on function public.note_ai_failure(text, text, text, text, timestamptz, text)
      from anon, authenticated;
    grant execute on function public.note_ai_failure(text, text, text, text, timestamptz, text)
      to service_role;
  end if;
end
$$;
