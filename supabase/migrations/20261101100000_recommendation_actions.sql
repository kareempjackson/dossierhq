-- The steps a senior technician would take to carry out a recommendation,
-- drafted with it and editable like its title and reason. Recommendations
-- drafted before this have none until the next run.
alter table public.recommendations
  add column suggested_actions text[] not null default '{}';

-- Rows that leave the steps out (from an API that predates them) get none,
-- rather than a null the column turns down.
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
