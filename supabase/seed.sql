-- Runs after migrations on `supabase db reset`.
insert into public.notes (title, body, created_at, updated_at) values
  (
    'Swap the database',
    'Set DATABASE_PROVIDER in apps/api/.env to supabase, postgres or memory and restart the API.',
    now() - interval '1 minute',
    now() - interval '1 minute'
  ),
  (
    'Welcome to DossierHQ',
    'This note came from supabase/seed.sql through the API''s database adapter.',
    now(),
    now()
  );
