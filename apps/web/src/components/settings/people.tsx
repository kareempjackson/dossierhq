'use client';

import type {
  Invite,
  InviteRole,
  Member,
  WorkspaceRole,
} from '@dossierhq/contracts';
import { useId, useState, useTransition, type FormEvent } from 'react';
import {
  inviteMember,
  removeMember,
  setMemberRole,
  withdrawInvite,
} from '@/app/member-actions';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/ui/list-card';
import { SectionHeader } from '@/components/ui/section-header';
import { formatDate } from '@/lib/format';

const ROLE_NAMES: Record<WorkspaceRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  technician: 'Technician',
};

const fieldClass =
  'h-9 rounded-input bg-surface px-3 text-body text-ink placeholder:text-muted';

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
    <div className="flex flex-col gap-8">
      <section aria-labelledby="people" className="flex flex-col gap-3">
        <SectionHeader
          id="people"
          title="People"
          count={members.length}
          note="Owners and admins manage connections, people and drafting. Technicians review reports and recommendations."
        />
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
      </section>

      {invites && (
        <section aria-labelledby="invite" className="flex flex-col gap-3">
          <SectionHeader
            id="invite"
            title="Invite someone"
            note="They get an email with a link that works for 7 days"
          />
          <div className="rounded-card bg-sheet p-4 shadow-card">
            <InviteForm />
          </div>
          {invites.length > 0 && (
            <>
              <SectionHeader
                id="pending-invites"
                title="Waiting to join"
                count={invites.length}
                as="h3"
                className="mt-3"
              />
              <ListCard>
                {invites.map((invite) => (
                  <InviteRow
                    key={invite.id}
                    invite={invite}
                    expired={invite.expiresAt <= now}
                    timeZone={timeZone}
                  />
                ))}
              </ListCard>
            </>
          )}
        </section>
      )}
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
  const roleId = useId();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
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
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-body text-ink">
            {member.name}
            {member.id === me.id && <span className="text-muted"> (you)</span>}
          </p>
          <p className="truncate text-meta text-muted">
            {member.email}
            {member.title && ` · ${member.title}`}
          </p>
        </div>
        {editable ? (
          <div className="flex items-center gap-1">
            <label htmlFor={roleId} className="sr-only">
              {member.name}’s role
            </label>
            <select
              id={roleId}
              value={member.role}
              disabled={pending}
              onChange={(event) => changeRole(event.target.value)}
              className={fieldClass}
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {ROLE_NAMES[role]}
                </option>
              ))}
            </select>
            {confirming ? (
              <>
                <Button variant="ghost" disabled={pending} onClick={remove}>
                  {pending ? 'Removing…' : `Remove ${member.name}`}
                </Button>
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setConfirming(false)}
                >
                  Keep
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => setConfirming(true)}
              >
                Remove
              </Button>
            )}
          </div>
        ) : (
          <p className="text-meta text-text">{ROLE_NAMES[member.role]}</p>
        )}
      </div>
      {confirming && (
        <p className="mt-2 text-meta text-muted">
          Removing {member.name} signs them out and deletes their account. You
          can invite them again later.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-meta text-alert">
          {error}
        </p>
      )}
    </li>
  );
}

function InviteForm() {
  const ids = { email: useId(), role: useId() };
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('technician');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSent(null);
    startTransition(async () => {
      const result = await inviteMember({ email, role });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSent(email);
      setEmail('');
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1.5">
          <label htmlFor={ids.email} className="text-meta font-medium text-ink">
            Email
          </label>
          <input
            id={ids.email}
            type="email"
            required
            spellCheck={false}
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@yourmsp.com"
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.role} className="text-meta font-medium text-ink">
            Role
          </label>
          <select
            id={ids.role}
            value={role}
            onChange={(event) => setRole(event.target.value as InviteRole)}
            className={fieldClass}
          >
            <option value="technician">Technician</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Sending…' : 'Send invite'}
        </Button>
      </div>
      {sent && (
        <p role="status" className="text-meta text-text">
          Invite sent to {sent}.
        </p>
      )}
      {error && (
        <p role="alert" className="text-meta text-alert">
          {error}
        </p>
      )}
    </form>
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
  const [pending, startTransition] = useTransition();

  function run(
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-56">
          <p className="truncate text-body text-ink">{invite.email}</p>
          <p className="text-meta text-muted">
            {ROLE_NAMES[invite.role]} · invited by {invite.invitedBy} ·{' '}
            {expired
              ? `expired ${formatDate(invite.expiresAt, timeZone)}`
              : `link works until ${formatDate(invite.expiresAt, timeZone)}`}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() =>
              run(() =>
                inviteMember({ email: invite.email, role: invite.role }),
              )
            }
          >
            Send again
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => withdrawInvite(invite.id))}
          >
            Withdraw
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-meta text-alert">
          {error}
        </p>
      )}
    </li>
  );
}
