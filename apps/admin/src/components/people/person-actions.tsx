'use client';

import { useState, useTransition } from 'react';
import { helpPerson } from '@/app/workspace-actions';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/ui/list-card';
import { StatusDot } from '@/components/ui/status-dot';

type Action = 'sign-out' | 'password-reset' | 'two-factor-off';

/**
 * What staff can do for someone who can't get in. Each asks once more, and
 * each shows in the person's workspace's audit log as Dossier support.
 */
export function PersonActions({
  id,
  name,
  twoFactor,
  sessions,
}: {
  id: string;
  name: string;
  twoFactor: boolean;
  sessions: number;
}) {
  const actions: {
    action: Action;
    title: string;
    description: string;
    confirm: string;
    done: string;
    disabled?: boolean;
  }[] = [
    {
      action: 'password-reset',
      title: 'Email a password reset link',
      description: `Sends ${name} a link to choose a new password, which works once, for an hour.`,
      confirm: 'Send the link',
      done: 'Sent.',
    },
    {
      action: 'sign-out',
      title: 'Sign out everywhere',
      description: `Ends every session ${name} has, for a lost laptop or a shared login.`,
      confirm: 'Sign them out',
      done: 'Signed out everywhere.',
      disabled: sessions === 0,
    },
    {
      action: 'two-factor-off',
      title: 'Turn off two-factor sign-in',
      description: `Only once you’ve checked it’s really ${name}, who lost their phone and recovery codes. They’re told, in Dossier and by email.`,
      confirm: 'Turn it off',
      done: 'Turned off.',
      disabled: !twoFactor,
    },
  ];
  return (
    <section aria-labelledby="help-heading" className="mt-10">
      <h2 id="help-heading" className="text-section font-medium text-ink">
        Help them sign in
      </h2>
      <ListCard className="mt-3">
        {actions.map((item) => (
          <ActionRow key={item.action} id={id} {...item} />
        ))}
      </ListCard>
    </section>
  );
}

function ActionRow({
  id,
  action,
  title,
  description,
  confirm,
  done,
  disabled,
}: {
  id: string;
  action: Action;
  title: string;
  description: string;
  confirm: string;
  done: string;
  disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    failed: boolean;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <li className="flex flex-col gap-2 px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-ink">{title}</span>
          <span className="block text-meta text-muted">{description}</span>
        </span>
        {asking ? (
          <span className="flex gap-1">
            <Button
              size="sm"
              variant="primary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await helpPerson(id, action);
                  setAsking(false);
                  setMessage(
                    result.ok
                      ? { text: done, failed: false }
                      : { text: result.error, failed: true },
                  );
                })
              }
            >
              {pending ? 'Working…' : confirm}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button
            size="sm"
            disabled={disabled}
            onClick={() => {
              setMessage(null);
              setAsking(true);
            }}
          >
            {title.split(' ').slice(0, 2).join(' ')}…
          </Button>
        )}
      </div>
      {message && (
        <StatusDot
          tone={message.failed ? 'failure' : 'positive'}
          label={message.text}
          className="text-meta text-ink"
        />
      )}
    </li>
  );
}
