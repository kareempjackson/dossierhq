'use client';

import type { Sessions, TwoFactorStatus } from '@dossierhq/contracts';
import { KeyRound, Monitor, MonitorSmartphone } from 'lucide-react';
import { useState, useTransition, type TransitionStartFunction } from 'react';
import { emailPasswordLink, signOutEverywhereElse } from '@/app/member-actions';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/ui/list-card';
import { Pill } from '@/components/ui/pill';
import { Feedback, SettingRow, type Message } from './setting-row';
import { TwoFactor } from './two-factor';
import { formatDate, formatDateTime, plural } from '@/lib/format';

/** "3 days" for 72 hours, "12 hours" otherwise. */
const idleFor = (hours: number) =>
  hours % 24 === 0 ? plural(hours / 24, 'day') : plural(hours, 'hour');

type Row = 'password' | 'others';

/**
 * How the person signs in, and where: their password, two-factor sign-in,
 * this browser, and a way to end the others.
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
  const [message, setMessage] = useState<(Message & { row: Row }) | null>(null);
  const [sending, startSending] = useTransition();
  const [ending, startEnding] = useTransition();

  function run(
    row: Row,
    start: TransitionStartFunction,
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    done: string,
  ) {
    setMessage(null);
    start(async () => {
      const result = await action();
      setMessage(
        result.ok
          ? { row, text: done, failed: false }
          : { row, text: result.error, failed: true },
      );
    });
  }

  const feedback = (row: Row) => (
    <Feedback message={message?.row === row ? message : null} />
  );

  return (
    <ListCard>
      <SettingRow
        icon={KeyRound}
        title="Password"
        description={
          <>
            Dossier emails {email} a link to choose a new one. Using it signs
            you out everywhere else.
          </>
        }
        action={
          <Button
            size="sm"
            disabled={sending}
            onClick={() =>
              run(
                'password',
                startSending,
                emailPasswordLink,
                `Sent. Check ${email} for the link.`,
              )
            }
          >
            {sending ? 'Sending…' : 'Email me a link'}
          </Button>
        }
        feedback={feedback('password')}
      />

      <TwoFactor status={twoFactor} />

      <SettingRow
        icon={Monitor}
        title="This browser"
        badge={
          <Pill tone="positive" dot>
            Active now
          </Pill>
        }
        description={
          <>
            Signed in since {formatDate(sessions.current.createdAt, timeZone)}.
            Dossier signs you out after {idleFor(sessions.idleHours)} without
            using it, and on {formatDate(sessions.current.expiresAt, timeZone)}{' '}
            at the latest.
          </>
        }
      />

      <SettingRow
        icon={MonitorSmartphone}
        title="Other browsers and devices"
        description={
          sessions.others === 0 ? (
            'You’re not signed in anywhere else.'
          ) : (
            <>
              Signed in on{' '}
              {plural(
                sessions.others,
                'other browser or device',
                'other browsers or devices',
              )}
              {sessions.othersLastSeenAt &&
                `, last used ${formatDateTime(sessions.othersLastSeenAt, timeZone)}`}
              .
            </>
          )
        }
        action={
          sessions.others > 0 && (
            <Button
              size="sm"
              disabled={ending}
              onClick={() =>
                run(
                  'others',
                  startEnding,
                  signOutEverywhereElse,
                  'Signed out everywhere else.',
                )
              }
            >
              {ending ? 'Signing out…' : 'Sign out everywhere else'}
            </Button>
          )
        }
        feedback={feedback('others')}
      />
    </ListCard>
  );
}
