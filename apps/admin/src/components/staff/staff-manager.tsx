'use client';

import type { Staff, StaffInvite, StaffRole } from '@dossierhq/contracts';
import { useId, useState, useTransition } from 'react';
import {
  disableStaff,
  inviteStaff,
  setStaffRole,
  withdrawStaffInvite,
} from '@/app/staff-actions';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/ui/list-card';
import { Pill } from '@/components/ui/pill';
import { StatusDot } from '@/components/ui/status-dot';
import type { ActionResult } from '@/lib/attempt';
import { formatDate } from '@/lib/format';

const ROLE_NAMES: Record<StaffRole, string> = {
  support: 'Support',
  admin: 'Admin',
};

const fieldClass =
  'h-9 rounded-input bg-surface px-3 text-body text-ink aria-invalid:outline-2 aria-invalid:outline-alert';

/** One change at a time, with what went wrong shown beside it. */
function useChange() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (change: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      const result = await change();
      if (result.ok) after?.();
      else setError(result.error);
    });
  return { pending, error, run };
}

export function StaffManager({
  staff,
  invites,
  meId,
  canManage,
}: {
  staff: Staff[];
  invites: StaffInvite[];
  meId: string;
  canManage: boolean;
}) {
  const active = staff.filter((s) => !s.disabledAt);
  const gone = staff.filter((s) => s.disabledAt);
  return (
    <div className="mt-8 flex flex-col gap-8">
      {canManage && <InviteForm />}
      <section aria-labelledby="staff-heading">
        <h2 id="staff-heading" className="text-section font-medium text-ink">
          Staff <span className="text-muted">{active.length}</span>
        </h2>
        <ListCard className="mt-3">
          {active.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              isMe={member.id === meId}
              canManage={canManage}
            />
          ))}
        </ListCard>
      </section>
      {invites.length > 0 && (
        <section aria-labelledby="invites-heading">
          <h2
            id="invites-heading"
            className="text-section font-medium text-ink"
          >
            Invited <span className="text-muted">{invites.length}</span>
          </h2>
          <ListCard className="mt-3">
            {invites.map((invite) => (
              <InviteRow
                key={invite.id}
                invite={invite}
                canManage={canManage}
              />
            ))}
          </ListCard>
        </section>
      )}
      {gone.length > 0 && (
        <section aria-labelledby="gone-heading">
          <h2 id="gone-heading" className="text-section font-medium text-ink">
            Access taken away <span className="text-muted">{gone.length}</span>
          </h2>
          <p className="mt-1 text-meta text-muted">
            Kept so the activity log still names them.
          </p>
          <ListCard className="mt-3">
            {gone.map((member) => (
              <li key={member.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={member.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{member.name}</span>
                  <span className="block truncate text-meta text-muted">
                    {member.email} · since {formatDate(member.disabledAt!)}
                  </span>
                </span>
              </li>
            ))}
          </ListCard>
        </section>
      )}
    </div>
  );
}

function MemberRow({
  member,
  isMe,
  canManage,
}: {
  member: Staff;
  isMe: boolean;
  canManage: boolean;
}) {
  const { pending, error, run } = useChange();
  const [confirming, setConfirming] = useState(false);
  const id = useId();
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={member.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-ink">
            {member.name}
            {isMe && <span className="text-muted"> (you)</span>}
          </span>
          <span className="block truncate text-meta text-muted">
            {member.email} · joined {formatDate(member.createdAt)}
          </span>
        </span>
        {canManage ? (
          <>
            <label htmlFor={`${id}-role`} className="sr-only">
              Role for {member.name}
            </label>
            <select
              id={`${id}-role`}
              value={member.role}
              disabled={pending}
              onChange={(event) =>
                run(() =>
                  setStaffRole(member.id, event.target.value as StaffRole),
                )
              }
              className={fieldClass}
            >
              <option value="support">Support</option>
              <option value="admin">Admin</option>
            </select>
            {!isMe &&
              (confirming ? (
                <span className="flex gap-1">
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => disableStaff(member.id),
                        () => setConfirming(false),
                      )
                    }
                    className="text-alert"
                  >
                    Take away access
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirming(false)}
                  >
                    Cancel
                  </Button>
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirming(true)}
                >
                  Remove
                </Button>
              ))}
          </>
        ) : (
          <Pill tone={member.role === 'admin' ? 'positive' : 'neutral'}>
            {ROLE_NAMES[member.role]}
          </Pill>
        )}
      </div>
      {confirming && !error && (
        <p className="text-meta text-muted">
          {member.name} will be signed out at once and can’t sign in again.
        </p>
      )}
      {error && (
        <StatusDot
          tone="failure"
          label={error}
          className="text-meta text-ink"
        />
      )}
    </li>
  );
}

function InviteRow({
  invite,
  canManage,
}: {
  invite: StaffInvite;
  canManage: boolean;
}) {
  const { pending, error, run } = useChange();
  const expired = invite.expiresAt <= new Date().toISOString();
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-ink">{invite.email}</span>
          <span className="block truncate text-meta text-muted">
            {ROLE_NAMES[invite.role]} · invited by {invite.invitedBy} ·{' '}
            {expired ? 'expired' : `until ${formatDate(invite.expiresAt)}`}
          </span>
        </span>
        {canManage && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => withdrawStaffInvite(invite.id))}
          >
            Withdraw
          </Button>
        )}
      </div>
      {error && (
        <StatusDot
          tone="failure"
          label={error}
          className="text-meta text-ink"
        />
      )}
    </li>
  );
}

function InviteForm() {
  const { pending, error, run } = useChange();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('support');
  const [sent, setSent] = useState<string | null>(null);
  const id = useId();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setSent(null);
        run(
          () => inviteStaff(email, role),
          () => {
            setSent(email);
            setEmail('');
          },
        );
      }}
      className="flex flex-col gap-3 rounded-card bg-surface-soft p-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-60 flex-1 flex-col gap-1.5">
          <label
            htmlFor={`${id}-email`}
            className="text-meta font-medium text-ink"
          >
            Invite someone to the staff
          </label>
          <input
            id={`${id}-email`}
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@dossierhq.com"
            aria-invalid={Boolean(error) || undefined}
            className={`${fieldClass} bg-sheet`}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${id}-role`}
            className="text-meta font-medium text-ink"
          >
            As
          </label>
          <select
            id={`${id}-role`}
            value={role}
            onChange={(event) => setRole(event.target.value as StaffRole)}
            className={`${fieldClass} bg-sheet`}
          >
            <option value="support">Support</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <Button type="submit" variant="primary" disabled={pending || !email}>
          {pending ? 'Sending…' : 'Send invite'}
        </Button>
      </div>
      <p className="text-meta text-muted">
        Support can look at workspaces and open support views. Admins can also
        suspend and delete workspaces, change people’s accounts, and manage
        staff.
      </p>
      {sent && (
        <p role="status" className="text-meta text-ink">
          Invite sent to {sent}. The link works for 7 days.
        </p>
      )}
      {error && (
        <StatusDot
          tone="failure"
          label={error}
          className="text-meta text-ink"
        />
      )}
    </form>
  );
}
