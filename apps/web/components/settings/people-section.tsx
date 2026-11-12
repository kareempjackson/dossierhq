'use client';

import { Send } from 'lucide-react';
import { useId, useOptimistic, useState, useTransition } from 'react';
import {
  inviteMember,
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

  return (
    <>
      <ul className="flex flex-col gap-2">
        {members.map((member) => (
          <li
            key={member.id}
            className="flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-small font-medium">
                {member.name}
                {member.you && (
                  <span className="ml-2 text-[0.75rem] font-normal text-muted">
                    You
                  </span>
                )}
              </p>
              <p className="truncate text-[0.75rem] text-muted">
                {member.email}
              </p>
            </div>
            <Tag tone={ROLE_TONE[member.role]}>{member.role}</Tag>
          </li>
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
