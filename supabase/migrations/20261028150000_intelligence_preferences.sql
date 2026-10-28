-- What each workspace wants from Claude: which outputs it drafts, which
-- topics it looks for, and which kinds of records it may read. Null, or any
-- key left out, means on. Nullable because create_owner builds the row with
-- jsonb_populate_record, which ignores column defaults.
alter table public.workspaces add column intelligence_preferences jsonb;
