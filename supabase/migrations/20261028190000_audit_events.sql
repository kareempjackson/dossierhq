-- The audit log now holds sign-ins and the changes people make, as well as
-- what Dossier read from tools. Each entry says what kind it is, whether it
-- worked, and who did it (nobody, for Dossier's own syncs). Reads are kept
-- for 90 days; sign-ins and changes for longer (see AUDIT_*_DAYS).

alter table public.audit_entries rename column read to what;

alter table public.audit_entries
  add column kind text not null default 'read'
    check (kind in ('read', 'sign-in', 'change')),
  add column outcome text not null default 'ok'
    check (outcome in ('ok', 'failed')),
  -- The name and email are kept as they were, so an entry still says who
  -- did it after the person is removed.
  add column actor_user_id text references public.users on delete set null,
  add column actor_name text,
  add column actor_email text,
  add constraint audit_entries_actor_check
    check ((actor_name is null) = (actor_email is null)),
  -- Sign-ins and most changes aren't about a tool.
  alter column tool drop not null;

alter table public.audit_entries
  alter column kind drop default,
  alter column outcome drop default;

-- A client's history outlives the client: disconnecting the only tool that
-- knew a client removes the client but no longer its audit entries.
alter table public.audit_entries
  drop constraint audit_entries_client_id_fkey;

create index audit_entries_kind_idx
  on public.audit_entries (workspace_id, kind, at desc);
