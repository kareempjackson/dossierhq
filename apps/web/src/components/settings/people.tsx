'use client';

import type {
  Invite,
  InviteRole,
  Member,
  WorkspaceRole,
} from '@dossierhq/contracts';
import { ChevronDown, Mail, UserPlus } from 'lucide-react';
import { useId, useState, useTransition, type FormEvent } from 'react';
import {
  inviteMember,
  removeMember,
  setMemberRole,
  withdrawInvite,
} from '@/app/member-actions';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/ui/list-card';
import { Pill } from '@/components/ui/pill';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { ROLE_NAMES } from '@/lib/roles';
import { Feedback, SettingRow, type Message } from './setting-row';

type PeopleProps = {
  members: Member[];
  /** Null for technicians, who can't see or send invites. */
  invites: Invite[] | null;
  me: { id: string; role: WorkspaceRole };
  now: string;
  timeZone: string;
};

/**
 * Who is in the workspace and what they may do. Owners and admins change
 * roles, remove people and invite more; only owners touch owners.
 */
export function People({ members, invites, me, now, timeZone }: PeopleProps) {
  const manages = me.role === 'owner' || me.role === 'admin';
  return (
    <>
      <ListCard>
        {members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            me={me}
            editable={
              manages &&
              member.id !== me.id &&
              (member.role !== 'owner' || me.role === 'owner')
            }
          />
        ))}
      </ListCard>

      {invites && (
        <ListCard>
          <InviteForm />
          {invites.map((invite) => (
            <InviteRow
              key={invite.id}
              invite={invite}
              expired={invite.expiresAt <= now}
              timeZone={timeZone}
            />
          ))}
        </ListCard>
      )}
    </>
  );
}

/** A role menu shaped like the filters on client lists. */
function RoleSelect({
  label,
  value,
  roles,
  disabled,
  onChange,
  className,
}: {
  label: string;
  value: WorkspaceRole;
  roles: WorkspaceRole[];
  disabled?: boolean;
  onChange: (role: string) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className="relative inline-flex shrink-0">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'h-8 cursor-pointer appearance-none rounded-full bg-surface pr-8 pl-3.5 text-meta text-ink transition-colors hover:bg-hairline disabled:cursor-default disabled:opacity-50',
          className,
        )}
      >
        {roles.map((role) => (
          <option key={role} value={role}>
            {ROLE_NAMES[role]}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted"
      />
    </div>
  );
}

function MemberRow({
  member,
  me,
  editable,
}: {
  member: Member;
  me: PeopleProps['me'];
  editable: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const isMe = member.id === me.id;
  const roles: WorkspaceRole[] =
    me.role === 'owner'
      ? ['owner', 'admin', 'technician']
      : ['admin', 'technician'];

  function changeRole(role: string) {
    setError(null);
    startTransition(async () => {
      const result = await setMemberRole(member.id, role);
      if (!result.ok) setError(result.error);
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removeMember(member.id);
      if (!result.ok) {
        setError(result.error);
        setConfirming(false);
      }
    });
  }

  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-60 items-center gap-3">
          <Avatar name={member.name} tone={isMe ? 'deep' : 'soft'} />
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-body font-medium text-ink">
              <span className="truncate">{member.name}</span>
              {isMe && <Pill tone="quiet">You</Pill>}
            </p>
            <p className="truncate text-meta text-muted">
              {member.email}
              {member.title && ` · ${member.title}`}
            </p>
          </div>
        </div>
        {editable ? (
          <div className="flex items-center gap-1">
            <RoleSelect
              label={`${member.name}’s role`}
              value={member.role}
              roles={roles}
              disabled={pending}
              onChange={changeRole}
            />
            {!confirming && (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setConfirming(true)}
              >
                Remove
              </Button>
            )}
          </div>
        ) : (
          <Pill>{ROLE_NAMES[member.role]}</Pill>
        )}
      </div>
      {confirming && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-tile bg-surface py-2.5 pr-2.5 pl-4 sm:ml-12">
          <p className="min-w-0 flex-1 basis-60 text-meta text-text">
            Removing {member.name} signs them out and deletes their account. You
            can invite them again later.
          </p>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Keep
            </Button>
            <Button size="sm" disabled={pending} onClick={remove}>
              {pending ? 'Removing…' : `Remove ${member.name}`}
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-meta text-alert sm:ml-12">
          {error}
        </p>
      )}
    </li>
  );
}

function InviteForm() {
  const emailId = useId();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('technician');
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await inviteMember({ email, role });
      if (!result.ok) {
        setMessage({ text: result.error, failed: true });
        return;
      }
      setMessage({ text: `Invite sent to ${email}.`, failed: false });
      setEmail('');
    });
  }

  return (
    <SettingRow
      icon={UserPlus}
      title="Invite someone"
      description="They get an email with a link that works for 7 days."
      feedback={<Feedback message={message} />}
    >
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-60">
          <label htmlFor={emailId} className="sr-only">
            Email
          </label>
          <Mail
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
            strokeWidth={1.75}
          />
          <input
            id={emailId}
            type="email"
            required
            spellCheck={false}
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@yourmsp.com"
            className="h-9 w-full rounded-full bg-surface pr-4 pl-10 text-body text-ink placeholder:text-muted"
          />
        </div>
        <RoleSelect
          label="Role"
          value={role}
          roles={['technician', 'admin']}
          onChange={(value) => setRole(value as InviteRole)}
          className="h-9"
        />
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Sending…' : 'Send invite'}
        </Button>
      </form>
    </SettingRow>
  );
}

function InviteRow({
  invite,
  expired,
  timeZone,
}: {
  invite: Invite;
  expired: boolean;
  timeZone: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [resending, startResending] = useTransition();
  const [withdrawing, startWithdrawing] = useTransition();
  const pending = resending || withdrawing;

  function resend() {
    setError(null);
    startResending(async () => {
      const result = await inviteMember({
        email: invite.email,
        role: invite.role,
      });
      if (!result.ok) setError(result.error);
    });
  }

  function withdraw() {
    setError(null);
    startWithdrawing(async () => {
      const result = await withdrawInvite(invite.id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-60 items-center gap-3">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-muted"
          >
            <Mail className="size-4" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-body text-ink">
              <span className="truncate">{invite.email}</span>
              {expired ? (
                <Pill tone="quiet">Expired</Pill>
              ) : (
                <Pill tone="positive">Invited</Pill>
              )}
            </p>
            <p className="truncate text-meta text-muted">
              {ROLE_NAMES[invite.role]} · invited by {invite.invitedBy} ·{' '}
              {expired
                ? `expired ${formatDate(invite.expiresAt, timeZone)}`
                : `link works until ${formatDate(invite.expiresAt, timeZone)}`}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" disabled={pending} onClick={resend}>
            {resending ? 'Sending…' : 'Send again'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={withdraw}
          >
            {withdrawing ? 'Withdrawing…' : 'Withdraw'}
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-meta text-alert sm:ml-12">
          {error}
        </p>
      )}
    </li>
  );
}
