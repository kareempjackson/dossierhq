-- Anyone can sign up, and each sign-up creates a workspace with its owner.
-- This replaces first-run setup, which allowed only one workspace ever.

drop function public.create_first_owner(jsonb, jsonb, text);

-- Creates a workspace with p_user as its owner. Returns false, and changes
-- nothing, when the email already belongs to an account.
create function public.create_owner(
  p_workspace jsonb,
  p_user jsonb
) returns boolean
language plpgsql
set search_path = ''
as $$
begin
  insert into public.users
  select * from jsonb_populate_record(null::public.users, p_user)
  on conflict (email) do nothing;
  if not found then
    return false;
  end if;
  insert into public.workspaces
  select * from jsonb_populate_record(null::public.workspaces, p_workspace);
  insert into public.workspace_members (workspace_id, user_id, role)
  values (p_workspace ->> 'id', p_user ->> 'id', 'owner');
  return true;
end;
$$;

-- Only the API's server-side credentials may call it.
revoke execute on function public.create_owner(jsonb, jsonb) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.create_owner(jsonb, jsonb)
      from anon, authenticated;
    grant execute on function public.create_owner(jsonb, jsonb)
      to service_role;
  end if;
end
$$;
