-- What clients said in meetings, as Claude read it: from Fathom's summary of
-- a recording, or from notes someone added. Kept apart from the meetings
-- table, because every Fathom sync deletes and reinserts that table's rows.

-- Notes become sources Dossier can cite, whole or as an excerpt. They belong
-- to no tool, so syncs, which delete by tool, never touch them.
alter table public.sources
  alter column tool drop not null,
  drop constraint sources_kind_check,
  add constraint sources_kind_check check (kind in ('record', 'meeting', 'note')),
  drop constraint sources_meeting_fields,
  add constraint sources_meeting_fields check (
    kind <> 'meeting'
    or (
      tool = 'fathom'
      and meeting_id is not null
      and transcript_at is not null
      and speaker_role is not null
      and speaker_name is not null
      and quote is not null
    )
  ),
  add column note_id text references public.meeting_notes on delete cascade,
  add constraint sources_note_fields check (
    (kind = 'note') = (tool is null)
    and (kind <> 'note' or note_id is not null)
  );
create index sources_note_idx on public.sources (workspace_id, note_id)
  where note_id is not null;

create table public.meeting_points (
  -- The meeting's or the notes' own ID.
  id text primary key,
  workspace_id text not null references public.workspaces on delete cascade,
  -- One or the other. Meetings have no foreign key: a sync deletes and
  -- reinserts them, which would take their points with them.
  meeting_id text,
  note_id text references public.meeting_notes on delete cascade,
  -- What was read, so unchanged meetings aren't read again.
  input_hash text not null,
  status text not null check (status in ('ok', 'failed')),
  run_id text,
  planning jsonb not null default '[]',
  concerns jsonb not null default '[]',
  asked_for jsonb not null default '[]',
  attempted_at timestamptz not null,
  -- The last read that worked; null until one has.
  read_at timestamptz,
  -- Set while the meeting is missing from Fathom, in case it comes back.
  missing_since timestamptz,
  constraint meeting_points_subject check ((meeting_id is null) <> (note_id is null)),
  constraint meeting_points_id check (id = coalesce(meeting_id, note_id))
);
create index meeting_points_workspace_idx on public.meeting_points (workspace_id);

alter table public.meeting_points enable row level security;
create policy tenant on public.meeting_points for all to dossier_app
  using (workspace_id = current_setting('app.workspace_id', true))
  with check (workspace_id = current_setting('app.workspace_id', true));

-- Writes that must happen together. Both SQL adapters call these.

-- Adds notes, with the source that lets Dossier cite them.
create function public.add_meeting_note(
  p_workspace_id text,
  p_note jsonb,
  p_source jsonb
) returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.meeting_notes
  select * from jsonb_populate_record(null::public.meeting_notes, p_note);
  if p_source is not null then
    insert into public.sources
    select * from jsonb_populate_record(null::public.sources, p_source);
  end if;
end;
$$;

-- Files notes with a client (or the inbox, with null). What Dossier cited of
-- them and read from them belonged to the old client, so both start over.
create function public.file_meeting_note(
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
  if p_source is not null then
    insert into public.sources
    select * from jsonb_populate_record(null::public.sources, p_source);
  end if;
end;
$$;

-- Saves what was read from a meeting or notes. For notes, the excerpts it
-- cites replace the old ones (a null p_excerpts keeps them); nothing is saved
-- if the notes have moved to another client since they were read.
create function public.save_meeting_points(
  p_workspace_id text,
  p_client_id text,
  p_points jsonb,
  p_excerpts jsonb
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_note_id text := p_points ->> 'note_id';
begin
  if v_note_id is not null and not exists (
    select 1 from public.meeting_notes
    where workspace_id = p_workspace_id and id = v_note_id and client_id = p_client_id
  ) then
    return;
  end if;

  insert into public.meeting_points
  select * from jsonb_populate_record(null::public.meeting_points, p_points)
  on conflict (id) do update set
    input_hash = excluded.input_hash,
    status = excluded.status,
    run_id = excluded.run_id,
    planning = excluded.planning,
    concerns = excluded.concerns,
    asked_for = excluded.asked_for,
    attempted_at = excluded.attempted_at,
    read_at = excluded.read_at,
    missing_since = null;

  if v_note_id is not null and jsonb_typeof(p_excerpts) = 'array' then
    delete from public.sources
    where workspace_id = p_workspace_id and note_id = v_note_id and quote is not null;
    insert into public.sources
    select * from jsonb_populate_recordset(null::public.sources, p_excerpts);
  end if;
end;
$$;

-- Marks meetings gone from Fathom, unmarks those back, and forgets those gone
-- since before p_before. A grace period, so one bad read loses nothing.
create function public.prune_meeting_points(
  p_workspace_id text,
  p_now timestamptz,
  p_before timestamptz
) returns void
language sql
set search_path = ''
as $$
  update public.meeting_points p set missing_since = p_now
  where p.workspace_id = p_workspace_id
    and p.meeting_id is not null
    and p.missing_since is null
    and not exists (select 1 from public.meetings m where m.id = p.meeting_id);
  update public.meeting_points p set missing_since = null
  where p.workspace_id = p_workspace_id
    and p.missing_since is not null
    and exists (select 1 from public.meetings m where m.id = p.meeting_id);
  delete from public.meeting_points
  where workspace_id = p_workspace_id and missing_since < p_before;
$$;

revoke execute on function public.add_meeting_note(text, jsonb, jsonb) from public;
revoke execute on function public.file_meeting_note(text, text, text, jsonb) from public;
revoke execute on function public.save_meeting_points(text, text, jsonb, jsonb) from public;
revoke execute on function public.prune_meeting_points(text, timestamptz, timestamptz) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.meeting_points from anon, authenticated;
    revoke execute on function public.add_meeting_note(text, jsonb, jsonb)
      from anon, authenticated;
    revoke execute on function public.file_meeting_note(text, text, text, jsonb)
      from anon, authenticated;
    revoke execute on function public.save_meeting_points(text, text, jsonb, jsonb)
      from anon, authenticated;
    revoke execute on function public.prune_meeting_points(text, timestamptz, timestamptz)
      from anon, authenticated;
    grant execute on function public.add_meeting_note(text, jsonb, jsonb) to service_role;
    grant execute on function public.file_meeting_note(text, text, text, jsonb) to service_role;
    grant execute on function public.save_meeting_points(text, text, jsonb, jsonb) to service_role;
    grant execute on function public.prune_meeting_points(text, timestamptz, timestamptz)
      to service_role;
  end if;
end
$$;
