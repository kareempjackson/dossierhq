-- A drafted report keeps the records it cites as they stood when it was
-- drafted, so its citations still hold after a sync changes or drops them.
-- Reports from before this keep citing the live records.

alter table public.reports add column sources jsonb not null default '[]';
