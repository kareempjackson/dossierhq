-- Dossier's memory: what's written in the tools, kept and indexed so a model
-- can find it by meaning as well as by words. Ticket conversations, meeting
-- summaries and notes, device alerts and documentation are cut into chunks,
-- each searchable in full text and, once Voyage AI has embedded it, by
-- meaning (pgvector).
--
-- Memory outlives the sync window. It is keyed by the tools' stable IDs with
-- no foreign key to the tables syncs replace, so a ticket closed long ago,
-- or a comment past the last 25 NinjaOne keeps, is still remembered. It goes
-- when its client, its notes or its tool's connection goes, or when the
-- workspace stops sharing that kind of record with the model.
--
-- This needs pgvector 0.7 or newer (halfvec), installed in the "extensions"
-- schema as Supabase does it. Supabase, Neon, RDS and Cloud SQL all have it.

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

do $$
declare
  v_version text;
  v_schema text;
begin
  select e.extversion, n.nspname into v_version, v_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'vector';
  if v_schema <> 'extensions' then
    raise exception 'pgvector is installed in schema "%"; Dossier needs it in "extensions"', v_schema;
  end if;
  if string_to_array(split_part(v_version, '-', 1), '.')::int[] < array[0, 7] then
    raise exception 'pgvector % is too old; Dossier needs 0.7 or newer', v_version;
  end if;
end
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'dossier_app') then
    grant usage on schema extensions to dossier_app;
  end if;
end
$$;

-- One thing that was written: a ticket's conversation, a meeting's summary,
-- a set of notes, an alert, a documented asset. Its facts that change without
-- changing what was written (a ticket's status, who has it) live in meta,
-- which is never embedded.
create table public.memory_documents (
  workspace_id text not null references public.workspaces on delete cascade,
  -- kind:ref_id, e.g. "ticket:ninjaone-ticket-…".
  id text not null,
  client_id text not null references public.clients on delete cascade,
  kind text not null
    check (kind in ('ticket', 'summary', 'transcript', 'note', 'alert', 'asset')),
  -- The switch on the Intelligence page that shares it with the model.
  record text not null
    check (record in ('tickets', 'meetings', 'notes', 'devices', 'documentation')),
  -- The tool it came from; null for notes, which no tool holds.
  tool text,
  -- The ID of what it was read from: a ticket, meeting, note or source.
  ref_id text not null,
  note_id text references public.meeting_notes on delete cascade,
  -- The source that cites it as a whole.
  source_id text,
  title text not null,
  occurred_at timestamptz not null,
  meta jsonb not null default '{}',
  content_hash text not null,
  -- When it stopped being in its tool; null while it still is.
  missing_since timestamptz,
  indexed_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
create index memory_documents_client_idx
  on public.memory_documents (workspace_id, client_id, kind);

-- A passage of a document, as searched and embedded: a ticket's reply, a
-- section of a summary, a stretch of a transcript.
create table public.memory_chunks (
  workspace_id text not null,
  document_id text not null,
  key text not null,
  client_id text not null,
  kind text not null,
  record text not null,
  -- The MSP's own ticket notes, which no client saw.
  internal boolean not null default false,
  -- The client's people it concerns, as the person pages key them.
  person_keys text[] not null default '{}',
  occurred_at timestamptz not null,
  -- What it is and where it's from, written so it reads alone.
  heading text not null,
  body text not null,
  meta jsonb not null default '{}',
  -- A source of its own, e.g. a moment in a recording; else the document's.
  source_id text,
  content_hash text not null,
  tsv tsvector generated always as (
    setweight(to_tsvector('english'::regconfig, heading), 'B')
      || setweight(to_tsvector('english'::regconfig, body), 'A')
  ) stored,
  -- Null until embedded, and again whenever the text changes.
  embedding extensions.halfvec(1024),
  embedding_model text,
  primary key (workspace_id, document_id, key),
  foreign key (workspace_id, document_id)
    references public.memory_documents (workspace_id, id) on delete cascade
);
create index memory_chunks_client_idx
  on public.memory_chunks (workspace_id, client_id, occurred_at desc);
create index memory_chunks_tsv_idx on public.memory_chunks using gin (tsv);
create index memory_chunks_people_idx on public.memory_chunks using gin (person_keys);
create index memory_chunks_pending_idx
  on public.memory_chunks (workspace_id) where embedding_model is null;
-- Searches compare a question with every chunk the workspace may read, which
-- is exact and quick at an MSP's size. Past a few hundred thousand chunks a
-- workspace, an HNSW index on embedding is the next step.

-- Sources as they stood, so what memory and Dossier's insights cite can still
-- be shown after a sync drops it.
create table public.memory_sources (
  workspace_id text not null,
  id text not null,
  document_id text not null,
  client_id text,
  source jsonb not null,
  primary key (workspace_id, id),
  foreign key (workspace_id, document_id)
    references public.memory_documents (workspace_id, id) on delete cascade
);

alter table public.memory_documents enable row level security;
alter table public.memory_chunks enable row level security;
alter table public.memory_sources enable row level security;
create policy tenant on public.memory_documents for all to dossier_app
  using (workspace_id = current_setting('app.workspace_id', true))
  with check (workspace_id = current_setting('app.workspace_id', true));
create policy tenant on public.memory_chunks for all to dossier_app
  using (workspace_id = current_setting('app.workspace_id', true))
  with check (workspace_id = current_setting('app.workspace_id', true));
create policy tenant on public.memory_sources for all to dossier_app
  using (workspace_id = current_setting('app.workspace_id', true))
  with check (workspace_id = current_setting('app.workspace_id', true));

-- Saves documents with the chunks that are new or changed, drops the chunk
-- keys each lists in removedKeys (and no others), and keeps its sources. A
-- chunk whose text changed loses its embedding until it's embedded again.
create function public.save_memory(p_workspace_id text, p_docs jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  d jsonb;
  v_id text;
begin
  for d in select * from jsonb_array_elements(coalesce(p_docs, '[]')) loop
    v_id := d ->> 'id';
    insert into public.memory_documents (
      workspace_id, id, client_id, kind, record, tool, ref_id, note_id,
      source_id, title, occurred_at, meta, content_hash, missing_since, indexed_at
    ) values (
      p_workspace_id, v_id, d ->> 'clientId', d ->> 'kind', d ->> 'record',
      d ->> 'tool', d ->> 'refId', d ->> 'noteId', d ->> 'sourceId',
      d ->> 'title', (d ->> 'occurredAt')::timestamptz,
      coalesce(d -> 'meta', '{}'), d ->> 'contentHash', null, now()
    )
    on conflict (workspace_id, id) do update set
      client_id = excluded.client_id,
      record = excluded.record,
      tool = excluded.tool,
      note_id = excluded.note_id,
      source_id = excluded.source_id,
      title = excluded.title,
      occurred_at = excluded.occurred_at,
      meta = excluded.meta,
      content_hash = excluded.content_hash,
      missing_since = null,
      indexed_at = now();

    delete from public.memory_chunks
    where workspace_id = p_workspace_id and document_id = v_id
      and key in (select jsonb_array_elements_text(coalesce(d -> 'removedKeys', '[]')));

    insert into public.memory_chunks (
      workspace_id, document_id, key, client_id, kind, record, internal,
      person_keys, occurred_at, heading, body, meta, source_id, content_hash
    )
    select p_workspace_id, v_id, c ->> 'key', d ->> 'clientId', d ->> 'kind',
      d ->> 'record', coalesce((c ->> 'internal')::boolean, false),
      coalesce(array(select jsonb_array_elements_text(c -> 'personKeys')), '{}'),
      (c ->> 'occurredAt')::timestamptz, c ->> 'heading', c ->> 'body',
      coalesce(c -> 'meta', '{}'), c ->> 'sourceId', c ->> 'contentHash'
    from jsonb_array_elements(coalesce(d -> 'chunks', '[]')) c
    on conflict (workspace_id, document_id, key) do update set
      client_id = excluded.client_id,
      record = excluded.record,
      internal = excluded.internal,
      person_keys = excluded.person_keys,
      occurred_at = excluded.occurred_at,
      heading = excluded.heading,
      body = excluded.body,
      meta = excluded.meta,
      source_id = excluded.source_id,
      content_hash = excluded.content_hash,
      embedding = case
        when public.memory_chunks.content_hash = excluded.content_hash
        then public.memory_chunks.embedding
      end,
      embedding_model = case
        when public.memory_chunks.content_hash = excluded.content_hash
        then public.memory_chunks.embedding_model
      end;

    -- Notes filed with another client take their chunks along.
    update public.memory_chunks set client_id = d ->> 'clientId', record = d ->> 'record'
    where workspace_id = p_workspace_id and document_id = v_id
      and (client_id <> d ->> 'clientId' or record <> d ->> 'record');

    insert into public.memory_sources (workspace_id, id, document_id, client_id, source)
    select p_workspace_id, s ->> 'id', v_id, s ->> 'clientId', s
    from jsonb_array_elements(coalesce(d -> 'sources', '[]')) s
    on conflict (workspace_id, id) do update set
      document_id = excluded.document_id,
      client_id = excluded.client_id,
      source = excluded.source;
  end loop;
end;
$$;

-- Marks documents of these kinds that are gone from their tools, unmarks those
-- back, and forgets documentation gone since before p_forget_before: it says
-- how things are, so an old version only misleads. The rest is kept.
create function public.reconcile_memory(
  p_workspace_id text,
  p_kinds text[],
  p_present text[],
  p_now timestamptz,
  p_forget_before timestamptz
) returns void
language sql
set search_path = ''
as $$
  update public.memory_documents set missing_since = p_now
  where workspace_id = p_workspace_id and kind = any(p_kinds)
    and missing_since is null and not (id = any(p_present));
  update public.memory_documents set missing_since = null
  where workspace_id = p_workspace_id and missing_since is not null
    and id = any(p_present);
  delete from public.memory_documents
  where workspace_id = p_workspace_id and kind = 'asset'
    and missing_since < p_forget_before;
$$;

-- Stores embeddings, each only if its chunk still has the text it was made
-- from. Returns how many it stored.
create function public.set_memory_embeddings(
  p_workspace_id text,
  p_model text,
  p_rows jsonb
) returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.memory_chunks c set
    embedding = (r ->> 'embedding')::extensions.halfvec(1024),
    embedding_model = p_model
  from jsonb_array_elements(coalesce(p_rows, '[]')) r
  where c.workspace_id = p_workspace_id
    and c.document_id = r ->> 'documentId'
    and c.key = r ->> 'key'
    and c.content_hash = r ->> 'contentHash';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Which chunks a search may look at. p_filter: {clientIds[], personKey,
-- records[], kinds[], includeInternal, since, excludeDocumentIds[]}; a
-- missing key doesn't filter.
create function public.memory_filter_matches(
  c public.memory_chunks,
  p_filter jsonb
) returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    (p_filter -> 'clientIds' is null
      or c.client_id in (select jsonb_array_elements_text(p_filter -> 'clientIds')))
    and (p_filter ->> 'personKey' is null
      or (p_filter ->> 'personKey') = any(c.person_keys))
    and (p_filter -> 'records' is null
      or c.record in (select jsonb_array_elements_text(p_filter -> 'records')))
    and (p_filter -> 'kinds' is null
      or c.kind in (select jsonb_array_elements_text(p_filter -> 'kinds')))
    and (coalesce((p_filter ->> 'includeInternal')::boolean, false) or not c.internal)
    and (p_filter ->> 'since' is null
      or c.occurred_at >= (p_filter ->> 'since')::timestamptz)
    and (p_filter -> 'excludeDocumentIds' is null
      or c.document_id not in (
        select jsonb_array_elements_text(p_filter -> 'excludeDocumentIds')));
$$;

-- Finds chunks by meaning and by words, merged by reciprocal rank: each list
-- gives 1/(60 + rank), and a chunk in both adds them. Without p_embedding it
-- searches by words alone. Exact, so nothing a workspace holds is missed.
create function public.search_memory(
  p_workspace_id text,
  p_query text,
  p_embedding text,
  p_filter jsonb,
  p_limit integer
) returns table (
  document_id text,
  key text,
  client_id text,
  kind text,
  record text,
  internal boolean,
  person_keys text[],
  occurred_at timestamptz,
  heading text,
  body text,
  meta jsonb,
  source_id text,
  document_source_id text,
  title text,
  score double precision
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_words tsquery := nullif(
    replace(plainto_tsquery('english'::regconfig, coalesce(p_query, ''))::text, '&', '|'),
    ''
  )::tsquery;
  v_vector extensions.halfvec(1024) := p_embedding::extensions.halfvec(1024);
begin
  return query
  with eligible as materialized (
    select c.document_id, c.key, c.embedding, c.tsv
    from public.memory_chunks c
    where c.workspace_id = p_workspace_id
      and public.memory_filter_matches(c, p_filter)
  ),
  by_meaning as (
    select e.document_id, e.key,
      row_number() over (order by e.embedding operator(extensions.<=>) v_vector) as rank
    from eligible e
    where v_vector is not null and e.embedding is not null
    order by e.embedding operator(extensions.<=>) v_vector
    limit 50
  ),
  by_words as (
    select e.document_id, e.key,
      row_number() over (order by ts_rank_cd(e.tsv, v_words) desc) as rank
    from eligible e
    where v_words is not null and e.tsv operator(pg_catalog.@@) v_words
    order by ts_rank_cd(e.tsv, v_words) desc
    limit 50
  ),
  fused as (
    select coalesce(m.document_id, w.document_id) as document_id,
      coalesce(m.key, w.key) as key,
      coalesce(1.0 / (60 + m.rank), 0) + coalesce(1.0 / (60 + w.rank), 0) as score
    from by_meaning m
    full outer join by_words w on w.document_id = m.document_id and w.key = m.key
  )
  select c.document_id, c.key, c.client_id, c.kind, c.record, c.internal,
    c.person_keys, c.occurred_at, c.heading, c.body, c.meta, c.source_id,
    d.source_id, d.title, f.score::double precision
  from fused f
  join public.memory_chunks c
    on c.workspace_id = p_workspace_id and c.document_id = f.document_id and c.key = f.key
  join public.memory_documents d
    on d.workspace_id = p_workspace_id and d.id = c.document_id
  order by f.score desc, c.occurred_at desc, c.document_id, c.key
  limit greatest(p_limit, 0);
end;
$$;

-- Documents like this one: the nearest by meaning to its first chunk in
-- p_keys that has an embedding, one row per document, nearest first.
create function public.similar_memory(
  p_workspace_id text,
  p_document_id text,
  p_keys text[],
  p_filter jsonb,
  p_limit integer
) returns table (
  document_id text,
  key text,
  client_id text,
  kind text,
  record text,
  internal boolean,
  person_keys text[],
  occurred_at timestamptz,
  heading text,
  body text,
  meta jsonb,
  source_id text,
  document_source_id text,
  title text,
  score double precision
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_vector extensions.halfvec(1024);
begin
  select c.embedding into v_vector
  from public.memory_chunks c
  where c.workspace_id = p_workspace_id and c.document_id = p_document_id
    and c.key = any(p_keys) and c.embedding is not null
  order by array_position(p_keys, c.key)
  limit 1;
  if v_vector is null then
    return;
  end if;

  return query
  with nearest as (
    select distinct on (c.document_id) c.document_id, c.key,
      c.embedding operator(extensions.<=>) v_vector as distance
    from public.memory_chunks c
    where c.workspace_id = p_workspace_id
      and c.document_id <> p_document_id
      and c.key = any(p_keys)
      and c.embedding is not null
      and public.memory_filter_matches(c, p_filter)
    order by c.document_id, c.embedding operator(extensions.<=>) v_vector
  )
  select c.document_id, c.key, c.client_id, c.kind, c.record, c.internal,
    c.person_keys, c.occurred_at, c.heading, c.body, c.meta, c.source_id,
    d.source_id, d.title, (1 - n.distance)::double precision
  from nearest n
  join public.memory_chunks c
    on c.workspace_id = p_workspace_id and c.document_id = n.document_id and c.key = n.key
  join public.memory_documents d
    on d.workspace_id = p_workspace_id and d.id = c.document_id
  order by n.distance, c.document_id
  limit greatest(p_limit, 0);
end;
$$;

-- Forgets memory: p_filter {documentIds[], records[], internalOnly,
-- embeddingsOnly}. records and documentIds delete whole documents;
-- internalOnly deletes the MSP's internal chunks; embeddingsOnly keeps the
-- text and drops what Voyage made of it. Returns what it removed.
create function public.purge_memory(p_workspace_id text, p_filter jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_rows integer;
begin
  if p_filter -> 'documentIds' is not null then
    delete from public.memory_documents
    where workspace_id = p_workspace_id
      and id in (select jsonb_array_elements_text(p_filter -> 'documentIds'));
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end if;
  if p_filter -> 'records' is not null then
    delete from public.memory_documents
    where workspace_id = p_workspace_id
      and record in (select jsonb_array_elements_text(p_filter -> 'records'));
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end if;
  if coalesce((p_filter ->> 'internalOnly')::boolean, false) then
    delete from public.memory_chunks
    where workspace_id = p_workspace_id and internal;
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end if;
  if coalesce((p_filter ->> 'embeddingsOnly')::boolean, false) then
    update public.memory_chunks set embedding = null, embedding_model = null
    where workspace_id = p_workspace_id and embedding_model is not null;
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end if;
  return v_count;
end;
$$;

-- How much is remembered, for the Intelligence page.
create function public.memory_status(p_workspace_id text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'documents', coalesce((
      select jsonb_object_agg(kind, n) from (
        select kind, count(*) as n from public.memory_documents
        where workspace_id = p_workspace_id group by kind
      ) k
    ), '{}'),
    'chunks', (select count(*) from public.memory_chunks where workspace_id = p_workspace_id),
    'embedded', (
      select count(*) from public.memory_chunks
      where workspace_id = p_workspace_id and embedding_model is not null
    ),
    'oldestAt', (
      select min(occurred_at) from public.memory_documents where workspace_id = p_workspace_id
    )
  );
$$;

-- Disconnecting a tool forgets what memory kept of it too.
create or replace function public.remove_tool(p_workspace_id text, p_tool text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.replace_tool_records(p_workspace_id, p_tool, '{}');
  perform public.sync_clients(p_workspace_id, p_tool, '[]', '[]');
  delete from public.memory_documents
  where workspace_id = p_workspace_id and tool = p_tool;
end;
$$;

-- Notes filed with another client start over in memory as everywhere else.
create or replace function public.file_meeting_note(
  p_workspace_id text,
  p_id text,
  p_client_id text,
  p_source jsonb
) returns setof public.meeting_notes
language plpgsql
set search_path = ''
as $$
begin
  return query
    update public.meeting_notes set client_id = p_client_id
    where workspace_id = p_workspace_id and id = p_id
    returning *;
  if not found then
    return;
  end if;
  delete from public.sources where workspace_id = p_workspace_id and note_id = p_id;
  delete from public.meeting_points where workspace_id = p_workspace_id and note_id = p_id;
  delete from public.memory_documents where workspace_id = p_workspace_id and note_id = p_id;
  if p_source is not null then
    insert into public.sources
    select * from jsonb_populate_record(null::public.sources, p_source);
  end if;
end;
$$;

-- What a run was for, now that memory and reading add their own.
alter table public.intelligence_runs drop constraint intelligence_runs_kind_check;
alter table public.intelligence_runs add constraint intelligence_runs_kind_check
  check (kind in (
    'recommendations', 'ask', 'meetings', 'reports', 'patterns',
    'embeddings', 'tickets', 'people', 'themes'
  ));

revoke execute on function public.save_memory(text, jsonb) from public;
revoke execute on function public.reconcile_memory(text, text[], text[], timestamptz, timestamptz) from public;
revoke execute on function public.set_memory_embeddings(text, text, jsonb) from public;
revoke execute on function public.memory_filter_matches(public.memory_chunks, jsonb) from public;
revoke execute on function public.search_memory(text, text, text, jsonb, integer) from public;
revoke execute on function public.similar_memory(text, text, text[], jsonb, integer) from public;
revoke execute on function public.purge_memory(text, jsonb) from public;
revoke execute on function public.memory_status(text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'dossier_app') then
    grant execute on function public.save_memory(text, jsonb) to dossier_app;
    grant execute on function public.reconcile_memory(text, text[], text[], timestamptz, timestamptz) to dossier_app;
    grant execute on function public.set_memory_embeddings(text, text, jsonb) to dossier_app;
    grant execute on function public.memory_filter_matches(public.memory_chunks, jsonb) to dossier_app;
    grant execute on function public.search_memory(text, text, text, jsonb, integer) to dossier_app;
    grant execute on function public.similar_memory(text, text, text[], jsonb, integer) to dossier_app;
    grant execute on function public.purge_memory(text, jsonb) to dossier_app;
    grant execute on function public.memory_status(text) to dossier_app;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.memory_documents, public.memory_chunks, public.memory_sources
      from anon, authenticated;
    revoke execute on function public.save_memory(text, jsonb) from anon, authenticated;
    revoke execute on function public.reconcile_memory(text, text[], text[], timestamptz, timestamptz) from anon, authenticated;
    revoke execute on function public.set_memory_embeddings(text, text, jsonb) from anon, authenticated;
    revoke execute on function public.memory_filter_matches(public.memory_chunks, jsonb) from anon, authenticated;
    revoke execute on function public.search_memory(text, text, text, jsonb, integer) from anon, authenticated;
    revoke execute on function public.similar_memory(text, text, text[], jsonb, integer) from anon, authenticated;
    revoke execute on function public.purge_memory(text, jsonb) from anon, authenticated;
    revoke execute on function public.memory_status(text) from anon, authenticated;
    grant execute on function public.save_memory(text, jsonb) to service_role;
    grant execute on function public.reconcile_memory(text, text[], text[], timestamptz, timestamptz) to service_role;
    grant execute on function public.set_memory_embeddings(text, text, jsonb) to service_role;
    grant execute on function public.memory_filter_matches(public.memory_chunks, jsonb) to service_role;
    grant execute on function public.search_memory(text, text, text, jsonb, integer) to service_role;
    grant execute on function public.similar_memory(text, text, text[], jsonb, integer) to service_role;
    grant execute on function public.purge_memory(text, jsonb) to service_role;
    grant execute on function public.memory_status(text) to service_role;
  end if;
end
$$;
