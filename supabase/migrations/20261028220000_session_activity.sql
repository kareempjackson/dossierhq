-- Sessions now also end when they go unused for SESSION_IDLE_HOURS, as well
-- as at expires_at. last_seen_at is written at most every few minutes.

alter table public.sessions add column last_seen_at timestamptz;
-- Counted as used now, so adding this doesn't sign everyone out at once.
update public.sessions set last_seen_at = now();
alter table public.sessions alter column last_seen_at set not null;

create index sessions_seen_idx on public.sessions (last_seen_at);
