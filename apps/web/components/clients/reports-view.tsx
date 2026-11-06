'use client';

import type { Recipient } from '@dossierhq/contracts';
import Link from 'next/link';
import { useId, useOptimistic, useState, useTransition } from 'react';
import { saveRecipients } from '@/app/(workspace)/clients/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tag } from '@/components/ui/tag';
import { TextLink } from '@/components/ui/text-link';
import type { ReportRow } from '@/lib/client-views';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The client's weekly reports, and who they go to. Owners and admins add
 * and remove recipients; each change is saved at once, and shows before
 * the API answers.
 */
export function ReportsView({
  clientId,
  reports,
  recipients: saved,
  canChange,
  sends,
}: {
  clientId: string;
  reports: ReportRow[];
  recipients: Recipient[];
  /** Owners and admins change who gets reports; technicians only see. */
  canChange: boolean;
  /** "on Mondays at 09:00"; null when not on a schedule; undefined if unknown. */
  sends: string | null | undefined;
}) {
  const [recipients, setRecipients] = useOptimistic(saved);
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const save = (next: Recipient[]) =>
    startTransition(async () => {
      setError(null);
      setRecipients(next);
      const result = await saveRecipients(clientId, next);
      if (!result.ok) setError(result.error);
    });

  const add = () => {
    const address = email.trim().toLowerCase();
    if (!EMAIL.test(address)) {
      return setError('Enter an email address, like name@client.com.');
    }
    if (recipients.some((recipient) => recipient.email === address)) {
      return setError('That address already gets these reports.');
    }
    const local = address.split('@')[0] ?? address;
    save([
      ...recipients,
      {
        name: local.charAt(0).toUpperCase() + local.slice(1),
        email: address,
        copy: false,
      },
    ]);
    setEmail('');
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <section aria-labelledby="weekly-reports" className="min-w-0">
        <h2 id="weekly-reports" className="text-h3">
          Weekly reports
        </h2>
        {reports.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[34rem] border-separate border-spacing-y-1 text-left text-small">
              <thead>
                <tr className="text-[0.6875rem] text-muted">
                  {['Week', 'Status', 'Sent', 'To check'].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="px-3 pb-2 font-normal"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr
                    key={report.id}
                    className="relative odd:[&>td]:bg-grey-1 [&>td]:transition-colors hover:[&>td]:bg-grey-2"
                  >
                    <td className="rounded-l-xl px-3 py-3.5">
                      {report.toReview ? (
                        <Link
                          href={`/reports/${encodeURIComponent(report.id)}`}
                          className="rounded-sm font-semibold after:absolute after:inset-0"
                        >
                          {report.week}
                        </Link>
                      ) : (
                        <span className="font-semibold">{report.week}</span>
                      )}
                    </td>
                    <td className="px-3 py-3.5">
                      <Tag tone={report.status.tone}>{report.status.label}</Tag>
                    </td>
                    <td className="px-3 py-3.5 text-muted">
                      {report.sent ?? '—'}
                    </td>
                    <td className="rounded-r-xl px-3 py-3.5 text-muted">
                      {report.checks}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-grey-1 px-4 py-8 text-center text-small text-muted">
            No weekly reports yet. Dossier drafts one each week once a tool is
            connected.
          </p>
        )}
      </section>

      <aside
        aria-labelledby={`${id}-goes-to`}
        aria-busy={pending || undefined}
        className="self-start rounded-2xl bg-grey-1 p-4"
      >
        <h2
          id={`${id}-goes-to`}
          className="font-sans text-[0.75rem] font-normal tracking-normal text-muted"
        >
          Goes to
        </h2>
        {recipients.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-2">
            {recipients.map((recipient) => (
              <li
                key={recipient.email}
                className="flex items-start justify-between gap-3 rounded-xl bg-white px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-small font-medium">
                    {recipient.name || recipient.email}
                    {recipient.copy && (
                      <span className="ml-1.5 font-normal text-muted">cc</span>
                    )}
                  </p>
                  <p className="truncate text-[0.75rem] text-muted">
                    {recipient.email}
                  </p>
                </div>
                {canChange && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      save(
                        recipients.filter(
                          (each) => each.email !== recipient.email,
                        ),
                      )
                    }
                    aria-label={`Remove ${recipient.name || recipient.email}`}
                    className="rounded-sm text-[0.75rem] text-muted transition-colors hover:text-ink disabled:opacity-60"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 rounded-xl bg-white px-3 py-2.5 text-small text-muted">
            Nobody yet. Reports wait until someone is added.
          </p>
        )}

        {canChange ? (
          <form
            className="mt-4"
            // The check below words the problem; the browser's own wouldn't match.
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              add();
            }}
          >
            <label htmlFor={`${id}-email`} className="text-small font-medium">
              Add a recipient
            </label>
            <Input
              id={`${id}-email`}
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setError(null);
              }}
              placeholder="name@client.com"
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              className="mt-2 bg-white"
            />
            {error && (
              <p
                id={`${id}-error`}
                role="alert"
                className="mt-1.5 text-[0.75rem] text-attention"
              >
                {error}
              </p>
            )}
            <Button
              type="submit"
              variant="ink"
              size="sm"
              disabled={pending}
              className="mt-3 w-full"
            >
              Add recipient
            </Button>
          </form>
        ) : (
          <p className="mt-4 text-[0.75rem] text-muted">
            Owners and admins change who gets reports.
          </p>
        )}
        <p className="mt-4 text-[0.75rem] text-muted">
          {sends === null
            ? 'Approved reports aren’t sent on a schedule. '
            : sends
              ? `Reports send ${sends}, once approved. `
              : ''}
          Change this in{' '}
          <TextLink href="/reports/delivery">Report delivery</TextLink>.
        </p>
      </aside>
    </div>
  );
}
