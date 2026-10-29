-- Files kept with a client's contract, such as the signed agreement. They
-- live in the database, so every adapter stores them the same way. A
-- client's contract terms are already columns of clients, which syncs
-- leave alone; documents go with their client.

create table public.contract_documents (
  id text primary key,
  workspace_id text not null references public.workspaces on delete cascade,
  client_id text not null references public.clients on delete cascade,
  name text not null check (char_length(name) between 1 and 255),
  content_type text not null check (content_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'image/png',
    'image/jpeg'
  )),
  size integer not null check (size between 1 and 10485760),
  content bytea not null,
  uploaded_by text references public.users on delete set null,
  -- Kept as it was, so the file still says who added it.
  uploaded_by_name text not null,
  uploaded_at timestamptz not null,
  check (octet_length(content) = size)
);
create index contract_documents_client_idx
  on public.contract_documents (workspace_id, client_id, uploaded_at desc);

alter table public.contract_documents enable row level security;
create policy tenant on public.contract_documents for all to dossier_app
  using (workspace_id = current_setting('app.workspace_id', true))
  with check (workspace_id = current_setting('app.workspace_id', true));

-- For the Data API adapter, which can't send bytes as they are: content
-- goes in and comes out as base64.
create function public.add_contract_document(p_row jsonb, p_content text)
returns void
language sql
set search_path = ''
as $$
  insert into public.contract_documents (
    id, workspace_id, client_id, name, content_type, size, content,
    uploaded_by, uploaded_by_name, uploaded_at
  )
  select r.id, r.workspace_id, r.client_id, r.name, r.content_type, r.size,
    decode(p_content, 'base64'), r.uploaded_by, r.uploaded_by_name,
    r.uploaded_at
  from jsonb_populate_record(null::public.contract_documents, p_row) r
$$;

create function public.contract_document_content(
  p_workspace_id text,
  p_id text
) returns text
language sql
stable
set search_path = ''
as $$
  select encode(content, 'base64') from public.contract_documents
  where workspace_id = p_workspace_id and id = p_id
$$;

revoke execute on function public.add_contract_document(jsonb, text) from public;
revoke execute on function public.contract_document_content(text, text) from public;
grant execute on function public.add_contract_document(jsonb, text) to dossier_app;
grant execute on function public.contract_document_content(text, text) to dossier_app;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.contract_documents from anon, authenticated;
    revoke execute on function public.add_contract_document(jsonb, text)
      from anon, authenticated;
    revoke execute on function public.contract_document_content(text, text)
      from anon, authenticated;
    grant execute on function public.add_contract_document(jsonb, text)
      to service_role;
    grant execute on function public.contract_document_content(text, text)
      to service_role;
  end if;
end
$$;
