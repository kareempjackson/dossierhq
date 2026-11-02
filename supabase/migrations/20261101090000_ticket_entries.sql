-- What's written on each ticket: its description and the latest replies and
-- technicians' notes, cleaned when they're read. Syncs read them again only
-- for tickets that changed since, so entries_as_of keeps the ticket's
-- updated_at from when they were read. replace_tool_records copies whole rows,
-- so it carries both without changing.
alter table public.tickets
  add column entries jsonb,
  add column entries_as_of timestamptz;

comment on column public.tickets.entries is
  'TicketEntry[], oldest first; null until the tool''s entries are read.';
comment on column public.tickets.entries_as_of is
  'The ticket''s updated_at when its entries were read.';
