'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Tag, type TagTone } from '@/components/ui/tag';
import { useAppSelector } from '@/lib/store/hooks';
import { selectMe } from '@/lib/store/session-slice';
import type { Member, Team } from '@/lib/workspace';

const ROLE_TONE: Record<string, TagTone> = {
  Owner: 'drafted',
  Admin: 'neutral',
  Technician: 'neutral',
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_NAMES: Record<string, Member['role']> = {
  owner: 'Owner',
  admin: 'Admin',
  technician: 'Technician',
};

/**
 * Who's in the workspace (you first), pending invites, and inviting
 * someone. Invites are kept in the browser until the API is connected.
 */
export function PeopleSection({ team }: { team: Team }) {
  const me = useAppSelector(selectMe);
  const you = me?.user.email;
  const members: Member[] = [
    ...(me
      ? [
          {
            name: me.user.name,
            email: me.user.email,
            role: ROLE_NAMES[me.role],
          },
        ]
      : []),
    ...team.members.filter((member) => member.email !== you),
  ];
  const [pending, setPending] = useState(team.pending);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'Technician' | 'Admin'>('Technician');
  const [message, setMessage] = useState<{ error?: string; sent?: string }>({});
  const id = useId();

  const invite = () => {
    const address = email.trim().toLowerCase();
    if (!EMAIL.test(address))
      return setMessage({
        error: 'Enter an email address, like name@yourmsp.com.',
      });
    if (
      members.some((member) => member.email === address) ||
      pending.some((each) => each.email === address)
    ) {
      return setMessage({
        error: 'They’re already in the workspace, or invited.',
      });
    }
    setPending([
      ...pending,
      { email: address, role, expires: 'link works for 7 days' },
    ]);
    setEmail('');
    setMessage({ sent: `Invite sent to ${address}.` });
  };

  return (
    <>
      <ul className="flex flex-col gap-2">
        {members.map((member) => (
          <li
            key={member.email}
            className="flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-small font-medium">
                {member.name}
                {member.email === you && (
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
            key={invite.email}
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
                onClick={() =>
                  setPending(
                    pending.filter((each) => each.email !== invite.email),
                  )
                }
                className="rounded-sm text-[0.75rem] text-muted hover:text-ink"
              >
                Withdraw
              </button>
              <Tag tone="act">Pending</Tag>
            </div>
          </li>
        ))}
      </ul>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          invite();
        }}
        className="mt-4"
      >
        <p className="text-small font-medium">Invite someone</p>
        <p className="text-[0.75rem] text-muted">
          They get an email with a link that works for 7 days.
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
            className="min-w-[14rem] flex-1 bg-white"
          />
          <div className="w-40">
            <label htmlFor={`${id}-role`} className="sr-only">
              Role
            </label>
            <Select
              id={`${id}-role`}
              value={role}
              onChange={(event) =>
                setRole(event.target.value as 'Technician' | 'Admin')
              }
              className="bg-white"
            >
              <option value="Technician">Technician</option>
              <option value="Admin">Admin</option>
            </Select>
          </div>
          <Button type="submit" variant="ink" className="h-11">
            Send invite
          </Button>
        </div>
        {(message.error || message.sent) && (
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
        )}
      </form>
    </>
  );
}
