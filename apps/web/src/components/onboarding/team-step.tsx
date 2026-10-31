'use client';

import type { Invite, InviteRole } from '@dossierhq/contracts';
import { Check, Plus, X } from 'lucide-react';
import { useId, useRef, useState, useTransition, type FormEvent } from 'react';
import { sendInvite } from '@/app/onboarding-actions';
import { Button } from '@/components/ui/button';
import {
  fieldClass,
  StepError,
  StepFooter,
  StepHeader,
  type StepProps,
} from './step-parts';

type Row = { key: number; email: string; role: InviteRole; error?: string };

const ROLE_HINTS: Record<InviteRole, string> = {
  admin: 'Admins also manage connections, people and reports.',
  technician: 'Technicians review reports and recommendations.',
};

const emptyRow = (key: number): Row => ({ key, email: '', role: 'technician' });

export function TeamStep({
  next,
  back,
  invites,
  onInvited,
}: StepProps & {
  invites: Invite[];
  onInvited: (invite: Invite) => void;
}) {
  const id = useId();
  // Counted here, not per module, so the server and browser agree on ids.
  const keys = useRef(1);
  const newRow = () => emptyRow(keys.current++);
  const [rows, setRows] = useState<Row[]>(() => [emptyRow(0)]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const filled = rows.filter((row) => row.email.trim());

  const update = (key: number, change: Partial<Row>) =>
    setRows((all) =>
      all.map((row) =>
        row.key === key ? { ...row, ...change, error: undefined } : row,
      ),
    );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (filled.length === 0) return next();
    startTransition(async () => {
      const left: Row[] = [];
      for (const row of filled) {
        const result = await sendInvite({
          email: row.email.trim(),
          role: row.role,
        });
        if (result.ok) onInvited(result.invite);
        else left.push({ ...row, error: result.error });
      }
      if (left.length > 0) {
        setRows(left);
        setError(
          left.length === filled.length
            ? 'None of those invites went. Check the addresses below.'
            : 'Some invites went; check the ones still below.',
        );
      } else {
        setRows([newRow()]);
      }
    });
  }

  return (
    <form onSubmit={submit}>
      <StepHeader eyebrow="Your team" title="Invite your team">
        Each person gets an email to join, sets their own password, and goes
        through a shorter version of this. Invites work for 7 days.
      </StepHeader>

      {invites.length > 0 && (
        <ul aria-label="Invited" className="mt-8 flex flex-col gap-2">
          {invites.map((invite) => (
            <li
              key={invite.id}
              className="flex items-center gap-3 rounded-tile bg-brand-soft px-4 py-3 motion-safe:animate-enter"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand text-white">
                <Check aria-hidden className="size-3.5" strokeWidth={3} />
              </span>
              <span className="min-w-0 flex-1 truncate text-body text-ink">
                {invite.email}
              </span>
              <span className="text-meta text-muted capitalize">
                {invite.role}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 flex flex-col gap-3">
        {rows.map((row, index) => (
          <div key={row.key} className="flex flex-col gap-1">
            <div className="flex flex-wrap gap-2">
              <label htmlFor={`${id}-${row.key}-email`} className="sr-only">
                Email {index + 1}
              </label>
              <input
                id={`${id}-${row.key}-email`}
                type="email"
                value={row.email}
                onChange={(event) =>
                  update(row.key, { email: event.target.value })
                }
                spellCheck={false}
                placeholder="colleague@yourmsp.com"
                aria-invalid={Boolean(row.error) || undefined}
                aria-describedby={
                  row.error ? `${id}-${row.key}-error` : undefined
                }
                className={`${fieldClass} min-w-0 flex-1 basis-56`}
              />
              <label htmlFor={`${id}-${row.key}-role`} className="sr-only">
                Role {index + 1}
              </label>
              <select
                id={`${id}-${row.key}-role`}
                value={row.role}
                onChange={(event) =>
                  update(row.key, { role: event.target.value as InviteRole })
                }
                className={`${fieldClass} w-36`}
              >
                <option value="technician">Technician</option>
                <option value="admin">Admin</option>
              </select>
              {rows.length > 1 && (
                <Button
                  variant="ghost"
                  aria-label={`Remove ${row.email || `row ${index + 1}`}`}
                  onClick={() =>
                    setRows((all) => all.filter((r) => r.key !== row.key))
                  }
                  className="h-10 px-3"
                >
                  <X aria-hidden />
                </Button>
              )}
            </div>
            {row.error ? (
              <p
                id={`${id}-${row.key}-error`}
                className="text-meta-sm text-alert"
              >
                {row.error}
              </p>
            ) : (
              index === rows.length - 1 && (
                <p className="text-meta-sm text-muted">
                  {ROLE_HINTS[row.role]}
                </p>
              )
            )}
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          disabled={rows.length >= 10}
          onClick={() => setRows((all) => [...all, newRow()])}
        >
          <Plus aria-hidden />
          Add another
        </Button>
      </div>

      <div className="mt-6">
        <StepError message={error} />
      </div>

      <StepFooter back={back}>
        {filled.length > 0 ? (
          <>
            {invites.length > 0 && (
              <Button variant="ghost" disabled={pending} onClick={next}>
                Done inviting
              </Button>
            )}
            <Button type="submit" variant="primary" disabled={pending}>
              {pending
                ? 'Sending…'
                : `Send ${filled.length === 1 ? 'invite' : `${filled.length} invites`}`}
            </Button>
          </>
        ) : (
          <Button type="submit" variant="primary">
            {invites.length > 0 ? 'Continue' : 'Skip for now'}
          </Button>
        )}
      </StepFooter>
    </form>
  );
}
