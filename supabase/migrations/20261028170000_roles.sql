-- Three roles instead of owner/member. Admins manage the workspace alongside
-- its owners: connections, people, delivery and the audit log. Technicians do
-- the weekly work: reviewing reports and recommendations, syncing, adding
-- notes. Members become technicians, the role nearest what they could do.

alter table public.workspace_members
  drop constraint workspace_members_role_check;

update public.workspace_members set role = 'technician' where role = 'member';

alter table public.workspace_members
  add constraint workspace_members_role_check
  check (role in ('owner', 'admin', 'technician'));
