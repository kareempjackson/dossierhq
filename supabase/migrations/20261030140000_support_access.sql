-- Support views: a member of Dossier's staff opens a workspace read-only, as
-- its owner sees it, for at most an hour, with a reason the workspace's own
-- audit log keeps. The admin app hands over a one-time link (its hash here,
-- for two minutes); opening it swaps that for the view's session. Like
-- sessions, only SHA-256s of tokens are stored.

create table public.support_grants (
  id text primary key,
  workspace_id text not null references public.workspaces on delete cascade,
  -- Kept as it was, so the list still reads right after a rename.
  workspace_name text not null,
  staff_id text references public.staff_users on delete set null,
  staff_name text not null,
  staff_email text not null,
  reason text not null check (char_length(reason) between 1 and 500),
  -- The owner the view acts as, chosen when the link is opened.
  acting_user_id text references public.users on delete set null,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  ended_at timestamptz,
  -- Who or what ended it, in words: a name, or that its time ran out.
  ended_by text check (char_length(ended_by) <= 200),
  handoff_hash text unique,
  handoff_expires_at timestamptz not null,
  session_hash text unique,
  redeemed_at timestamptz
);
create index support_grants_workspace_idx
  on public.support_grants (workspace_id, created_at desc);
create index support_grants_created_idx on public.support_grants (created_at desc);
create index support_grants_live_idx
  on public.support_grants (expires_at) where ended_at is null;

alter table public.support_grants enable row level security;

-- Read before the workspace is known (opening the link, every request in
-- the view), and listed across workspaces for staff, like sessions.
create policy support on public.support_grants for all to dossier_app
  using (true) with check (true);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.support_grants from anon, authenticated;
  end if;
end
$$;
