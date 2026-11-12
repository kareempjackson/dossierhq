'use client';

import { useId, useOptimistic, useState, useTransition } from 'react';
import { setNotificationChannel } from '@/app/(workspace)/settings/actions';
import { Switch } from '@/components/ui/switch';
import type { NotificationGroup, NotificationRow } from '@/lib/settings-views';

type Channel = 'inApp' | 'email';
type Change = { type: string; channel: Channel; on: boolean };

/**
 * Each event you hear about, in Dossier and by email, saved as you flip it.
 * The switch moves at once; if the API says no, it moves back with why.
 */
export function NotificationSettings({
  groups,
}: {
  groups: NotificationGroup[];
}) {
  const [shown, apply] = useOptimistic(
    groups,
    (current, { type, channel, on }: Change) =>
      current.map((group) => ({
        ...group,
        events: group.events.map((event) =>
          event.type === type ? { ...event, [channel]: on } : event,
        ),
      })),
  );
  const [problem, setProblem] = useState<{
    type: string;
    message: string;
  } | null>(null);
  const [, startTransition] = useTransition();
  const id = useId();

  const change = (next: Change) =>
    startTransition(async () => {
      apply(next);
      setProblem(null);
      const result = await setNotificationChannel(
        next.type,
        next.channel,
        next.on,
      );
      if (!result.ok) setProblem({ type: next.type, message: result.error });
    });

  if (shown.length === 0) {
    return (
      <p className="rounded-xl bg-white px-4 py-6 text-small text-muted">
        Nothing to choose yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {shown.map((group) => (
        <div key={group.id}>
          <h3 className="font-sans text-base font-medium tracking-normal">
            {group.name}
          </h3>
          <p className="text-[0.75rem] text-muted">{group.description}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {group.events.map((event) => (
              <EventRow
                key={event.type}
                base={`${id}-${event.type.replace('.', '-')}`}
                event={event}
                problem={
                  problem?.type === event.type ? problem.message : undefined
                }
                onChange={(channel, on) =>
                  change({ type: event.type, channel, on })
                }
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function EventRow({
  base,
  event,
  problem,
  onChange,
}: {
  base: string;
  event: NotificationRow;
  problem?: string;
  onChange: (channel: Channel, on: boolean) => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white px-4 py-3">
      <div className="min-w-56 flex-1">
        <p id={base} className="text-small font-medium">
          {event.label}
        </p>
        <p id={`${base}-detail`} className="text-[0.75rem] text-muted">
          {event.description}
          {event.locked.email &&
            ' Always emailed, so you hear about it wherever you are.'}
        </p>
        {problem && (
          <p role="alert" className="mt-1 text-[0.75rem] text-attention">
            {problem}
          </p>
        )}
      </div>
      <div className="flex items-center gap-5">
        {(
          [
            ['inApp', 'In Dossier'],
            ['email', 'Email'],
          ] as const
        ).map(([channel, label]) => (
          <span
            key={channel}
            className="flex items-center gap-2 text-[0.75rem] text-muted"
          >
            <span id={`${base}-${channel}`}>{label}</span>
            <Switch
              checked={event[channel]}
              labelledBy={`${base}-${channel} ${base}`}
              describedBy={event.locked[channel] ? `${base}-detail` : undefined}
              disabled={event.locked[channel]}
              onChange={(on) => onChange(channel, on)}
            />
          </span>
        ))}
      </div>
    </li>
  );
}
