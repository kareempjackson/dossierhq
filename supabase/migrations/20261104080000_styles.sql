-- Everything Dossier drafts now comes in two styles from the same call: a
-- technical one for a senior engineer at the MSP, and an executive one for
-- leadership. The technical style is the columns that were already there,
-- plus a recommendation's risk and how to confirm it worked. Drafts made
-- before this have no executive version until they are drafted again.

alter table public.recommendations
  add column risk text,
  add column verification text,
  -- {headline, points[], decision}, for the client's leadership.
  add column executive jsonb,
  -- The technical version was edited after the executive one was written.
  add column executive_stale boolean not null default false;

-- {headline, points[], decision}, for the MSP's own leadership: a pattern
-- names several clients, so it is never for a client to read.
alter table public.patterns add column executive jsonb;

-- [{text, sourceIds}], the answer in plain words for leadership.
alter table public.ask_answers
  add column executive_lines jsonb not null default '[]';

-- Rows from an API that predates these columns leave them out, and get the
-- column defaults rather than a null the NOT NULL columns turn down.
create or replace function public.replace_recommendation_drafts(
  p_workspace_id text,
  p_client_id text,
  p_rows jsonb
) returns void
language plpgsql
set search_path = ''
as $$
declare
  base public.recommendations;
begin
  base.suggested_actions := '{}';
  base.executive_stale := false;

  delete from public.recommendations
  where workspace_id = p_workspace_id
    and client_id = p_client_id
    and status = 'draft'
    and run_id is not null
    and not edited;

  insert into public.recommendations
  select * from jsonb_populate_recordset(base, p_rows);
end;
$$;
