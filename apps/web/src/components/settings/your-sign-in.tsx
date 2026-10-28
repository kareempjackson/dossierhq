'use client';

import type { Sessions, TwoFactorStatus } from '@dossierhq/contracts';
import { useState, useTransition } from 'react';
import { emailPasswordLink, signOutEverywhereElse } from '@/app/member-actions';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { TwoFactor } from './two-factor';
import { formatDate, formatDateTime, plural } from '@/lib/format';

/** "3 days" for 72 hours, "12 hours" otherwise. */
const idleFor = (hours: number) =>
  hours % 24 === 0 ? plural(hours / 24, 'day') : plural(hours, 'hour');

/**
 * Where the person is signed in: this browser, how many others, a way to end
 * those, two-factor sign-in, and a link to change their password.
 */
export function YourSignIn({
  sessions,
  twoFactor,
  email,
  timeZone,
}: {
  sessions: Sessions;
  twoFactor: TwoFactorStatus;
  email: string;
  timeZone: string;
}) {
  const [message, setMessage] = useState<{
    text: string;
    failed: boolean;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  function run(
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    done: string,
  ) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(
        result.ok
          ? { text: done, failed: false }
          : { text: result.error, failed: true },
      );
    });
  }

  return (
    <section aria-labelledby="your-sign-in" className="flex flex-col gap-3">
      <SectionHeader id="your-sign-in" title="Your sign-in" />
      <div className="flex flex-col gap-4 rounded-card bg-sheet p-4 shadow-card">
        <p className="text-body text-text">
          Signed in here since{' '}
          {formatDate(sessions.current.createdAt, timeZone)}. Dossier signs you
          out after {idleFor(sessions.idleHours)} without using it, and on{' '}
          {formatDate(sessions.current.expiresAt, timeZone)} at the latest.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-body text-text">
            {sessions.others === 0 ? (
              'Not signed in anywhere else.'
            ) : (
              <>
                Also signed in on{' '}
                {plural(
                  sessions.others,
                  'other browser or device',
                  'other browsers or devices',
                )}
                {sessions.othersLastSeenAt &&
                  `, last used ${formatDateTime(sessions.othersLastSeenAt, timeZone)}`}
                .
              </>
            )}
          </p>
          {sessions.others > 0 && (
            <Button
              disabled={pending}
              onClick={() =>
                run(signOutEverywhereElse, 'Signed out everywhere else.')
              }
            >
              Sign out everywhere else
            </Button>
          )}
        </div>

        <div className="border-t border-hairline pt-4">
          <TwoFactor status={twoFactor} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
          <p className="text-body text-text">
            To change your password, Dossier emails {email} a link. Using it
            signs you out everywhere else.
          </p>
          <Button
            disabled={pending}
            onClick={() =>
              run(emailPasswordLink, `Sent. Check ${email} for the link.`)
            }
          >
            Email me a link
          </Button>
        </div>

        {message && (
          <p
            role={message.failed ? 'alert' : 'status'}
            className={
              message.failed ? 'text-meta text-alert' : 'text-meta text-text'
            }
          >
            {message.text}
          </p>
        )}
      </div>
    </section>
  );
}
