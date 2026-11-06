-- Who is on each ticket, as Dossier read its conversation, and whether a
-- technician merged it into another.
--
-- Every column is nullable on purpose. `replace_tool_records` inserts
-- `select * from jsonb_populate_recordset(null::public.tickets, …)`, so code
-- that doesn't send a column yet (the running release, until it's replaced)
-- inserts NULL there; NOT NULL would fail its syncs. Readers take NULL as
-- "not read yet": no people, version 0, not complete, merged into nothing.

alter table public.tickets
  add column people jsonb,
  add column merged_into text,
  add column entries_complete boolean,
  add column entries_version smallint;

comment on column public.tickets.people is
  'TicketPerson[]: who started it first, then everyone who took part.';
comment on column public.tickets.merged_into is
  'The number of the ticket a technician merged this one into.';
comment on column public.tickets.entries_complete is
  'Every log entry was read, so nothing older is only in the tool.';
comment on column public.tickets.entries_version is
  'How the entries were read; Dossier reads them again when it moves on.';
