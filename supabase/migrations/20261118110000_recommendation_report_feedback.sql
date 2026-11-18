-- Recommendations are no longer accepted or dismissed one at a time. The team
-- puts any of them in the client's weekly report, and says whether each was
-- useful, which steers what Dossier drafts next. Runs keep both kinds of
-- draft, as they keep edited ones; the rest are replaced as before.

alter table public.recommendations
  add column in_report boolean not null default false,
  -- Null until someone says.
  add column useful boolean;

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
  base.in_report := false;

  delete from public.recommendations
  where workspace_id = p_workspace_id
    and client_id = p_client_id
    and status = 'draft'
    and run_id is not null
    and not edited
    and not in_report
    and useful is null;

  insert into public.recommendations
  select * from jsonb_populate_recordset(base, p_rows);
end;
$$;
