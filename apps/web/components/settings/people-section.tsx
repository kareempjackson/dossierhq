'use client';

import type { WorkspaceRole } from '@dossierhq/contracts';
import { Send, UserMinus } from 'lucide-react';
import { useId, useOptimistic, useState, useTransition } from 'react';
import {
  inviteMember,
  removeMember,
  setMemberRole,
  withdrawInvite,
} from '@/app/(workspace)/settings/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { BusyIcon } from '@/components/ui/spinner';
import { Tag, type TagTone } from '@/components/ui/tag';
import type { InviteRow, MemberRow, RoleName } from '@/lib/settings-views';

const ROLE_TONE: Record<RoleName, TagTone> = {
  Owner: 'drafted',
  Admin: 'neutral',
  Technician: 'neutral',
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Who's in the workspace (you first) and, for owners and admins, who's been
 * invited and a way to invite someone. Invites are emailed by the API.
 */
export function PeopleSection({
  members,
  invites,
  canManage,
}: {
  members: MemberRow[];
  invites: InviteRow[];
  canManage: boolean;
}) {
  const [pending, withdrawn] = useOptimistic(invites, (current, id: string) =>
    current.filter((invite) => invite.id !== id),
  );
  // Shown at once; the page reads everyone again once the API has said yes.
  const [shown, changed] = useOptimistic(
    members,
    (
      current,
      update: { id: string; level?: WorkspaceRole; removed?: boolean },
    ) =>
      update.removed
        ? current.filter((member) => member.id !== update.id)
        : current.map((member) => {
            const label = member.roles?.find(
              (role) => role.value === update.level,
            )?.label;
            return member.id === update.id && update.level && label
              ? { ...member, level: update.level, role: label }
              : member;
          }),
  );
  const [change, setChange] = useState<{ error?: string; sent?: string }>({});
  const [changing, startChanging] = useTransition();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'technician' | 'admin'>('technician');
  const [message, setMessage] = useState<{ error?: string; sent?: string }>({});
  const [sending, startSending] = useTransition();
  const [, startWithdrawing] = useTransition();
  const id = useId();

  const invite = () => {
    const address = email.trim().toLowerCase();
    if (!EMAIL.test(address)) {
      return setMessage({
        error: 'Enter an email address, like name@yourmsp.com.',
      });
    }
    if (members.some((member) => member.email.toLowerCase() === address)) {
      return setMessage({ error: 'They’re already in the workspace.' });
    }
    startSending(async () => {
      setMessage({});
      const result = await inviteMember(address, role);
      if (result.ok) {
        setEmail('');
        setMessage({ sent: `Invite sent to ${address}.` });
      } else {
        setMessage({ error: result.error });
      }
    });
  };

  const withdraw = (invite: InviteRow) =>
    startWithdrawing(async () => {
      withdrawn(invite.id);
      setMessage({});
      const result = await withdrawInvite(invite.id);
      setMessage(
        result.ok
          ? { sent: `Withdrew the invite to ${invite.email}.` }
          : { error: result.error },
      );
    });

  const changeRole = (member: MemberRow, level: WorkspaceRole) =>
    startChanging(async () => {
      changed({ id: member.id, level });
      setChange({});
      const result = await setMemberRole(member.id, level);
      const label = member.roles?.find((role) => role.value === level)?.label;
      setChange(
        result.ok
          ? { sent: `${member.name} is now ${anOf(label ?? level)}.` }
          : { error: result.error },
      );
    });

  const remove = (member: MemberRow) =>
    startChanging(async () => {
      changed({ id: member.id, removed: true });
      setChange({});
      const result = await removeMember(member.id);
      setChange(
        result.ok
          ? { sent: `Removed ${member.name} from the workspace.` }
          : { error: result.error },
      );
    });

  return (
    <>
      <ul className="flex flex-col gap-2">
        {shown.map((member) => (
          <MemberItem
            key={member.id}
            member={member}
            busy={changing}
            onRole={(level) => changeRole(member, level)}
            onRemove={() => remove(member)}
          />
        ))}
        {pending.map((invite) => (
          <li
            key={invite.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-white px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-small font-medium">{invite.email}</p>
              <p className="text-[0.75rem] text-muted">
                {invite.role} · invite sent · {invite.expires}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => withdraw(invite)}
                className="rounded-sm text-[0.75rem] text-muted hover:text-ink"
              >
                Withdraw
              </button>
              <Tag tone={invite.expired ? 'neutral' : 'act'}>
                {invite.expired ? 'Expired' : 'Pending'}
              </Tag>
            </div>
          </li>
        ))}
      </ul>
      <Note message={change} />

      {canManage ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            invite();
          }}
          className="mt-4"
        >
          <p className="text-small font-medium">Invite someone</p>
          <p className="text-[0.75rem] text-muted">
            They get an email with a link that works for 7 days. Inviting
            someone again sends them a fresh link.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <label htmlFor={`${id}-email`} className="sr-only">
              Email
            </label>
            <Input
              id={`${id}-email`}
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setMessage({});
              }}
              placeholder="name@yourmsp.com"
              aria-invalid={message.error ? true : undefined}
              className="min-w-56 flex-1 bg-white"
            />
            <div className="w-40">
              <label htmlFor={`${id}-role`} className="sr-only">
                Role
              </label>
              <Select
                id={`${id}-role`}
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as 'technician' | 'admin')
                }
                className="bg-white"
              >
                <option value="technician">Technician</option>
                <option value="admin">Admin</option>
              </Select>
            </div>
            <Button
              type="submit"
              variant="ink"
              className="h-11"
              disabled={sending}
            >
              <BusyIcon icon={Send} busy={sending} />
              Send invite
            </Button>
          </div>
          <Note message={message} />
        </form>
      ) : (
        <p className="mt-4 text-[0.75rem] text-muted">
          Only owners and admins can invite people.
        </p>
      )}
    </>
  );
}

/** "an Admin", "a Technician", "an Owner". */
const anOf = (role: string) =>
  `${/^[aeiou]/i.test(role) ? 'an' : 'a'} ${role}`;

/**
 * One person in the workspace. Those you can manage get their role as a
 * choice and a way to remove them; making someone an owner, and removing
 * anyone, asks first.
 */
function MemberItem({
  member,
  busy,
  onRole,
  onRemove,
}: {
  member: MemberRow;
  busy: boolean;
  onRole: (level: WorkspaceRole) => void;
  onRemove: () => void;
}) {
  const [asking, setAsking] = useState<'remove' | 'owner' | null>(null);
  const id = useId();

  return (
    <li className="rounded-xl bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-small font-medium">
            {member.name}
            {member.you && (
              <span className="ml-2 text-[0.75rem] font-normal text-muted">
                You
              </span>
            )}
          </p>
          <p className="truncate text-[0.75rem] text-muted">{member.email}</p>
        </div>
        {member.roles && !asking ? (
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setAsking('remove')}
              disabled={busy}
              className="rounded-sm text-[0.75rem] text-muted hover:text-ink disabled:opacity-50"
            >
              Remove
            </button>
            <label htmlFor={`${id}-role`} className="sr-only">
              {member.name}’s role
            </label>
            <div className="w-32">
              <Select
                id={`${id}-role`}
                compact
                value={member.level}
                disabled={busy}
                onChange={(event) => {
                  const level = event.target.value as WorkspaceRole;
                  if (level === 'owner') setAsking('owner');
                  else onRole(level);
                }}
              >
                {member.roles.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        ) : (
          <Tag tone={ROLE_TONE[member.role]}>{member.role}</Tag>
        )}
      </div>

      {asking && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-grey-1 px-3 py-2.5">
          <p className="text-small">
            {asking === 'remove'
              ? `Remove ${member.name}? Their account goes too, and they’re signed out at once. To come back, they need a new invite.`
              : `Make ${member.name} an owner? Owners can change or remove anyone, other owners included.`}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAsking(null)}
            >
              Cancel
            </Button>
            <Button
              variant="ink"
              size="sm"
              onClick={() => {
                setAsking(null);
                if (asking === 'remove') onRemove();
                else onRole('owner');
              }}
            >
              {asking === 'remove' ? (
                <>
                  <UserMinus
                    aria-hidden
                    className="size-4"
                    strokeWidth={1.75}
                  />
                  Remove
                </>
              ) : (
                'Make owner'
              )}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function Note({ message }: { message: { error?: string; sent?: string } }) {
  if (!message.error && !message.sent) return null;
  return (
    <p
      role={message.error ? 'alert' : 'status'}
      className={
        message.error
          ? 'mt-2 text-[0.75rem] text-attention'
          : 'mt-2 text-[0.75rem] text-healthy'
      }
    >
      {message.error ?? message.sent}
    </p>
  );
}
