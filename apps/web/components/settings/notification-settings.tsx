'use client';

import { useId, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { NOTIFICATION_GROUPS } from '@/lib/catalog';

type Channels = { inApp: boolean; email: boolean };

/** Each event, in Dossier and by email; sign-in events are always emailed. */
export function NotificationSettings() {
  const [prefs, setPrefs] = useState<Record<string, Channels>>(() =>
    Object.fromEntries(
      NOTIFICATION_GROUPS.flatMap((group) => group.events).map((event) => [
        event.id,
        { inApp: true, email: event.urgent },
      ]),
    ),
  );
  const id = useId();

  return (
    <div className="flex flex-col gap-6">
      {NOTIFICATION_GROUPS.map((group) => (
        <div key={group.id}>
          <h3 className="font-sans text-base font-medium tracking-normal">
            {group.name}
          </h3>
          <p className="text-[0.75rem] text-muted">{group.description}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {group.events.map((event) => {
              const base = `${id}-${event.id}`;
              const channels = prefs[event.id];
              const set = (patch: Partial<Channels>) =>
                setPrefs({ ...prefs, [event.id]: { ...channels, ...patch } });
              return (
                <li
                  key={event.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white px-4 py-3"
                >
                  <div className="min-w-[14rem] flex-1">
                    <p id={base} className="text-small font-medium">
                      {event.label}
                    </p>
                    <p
                      id={`${base}-detail`}
                      className="text-[0.75rem] text-muted"
                    >
                      {event.description}
                      {event.emailLocked &&
                        ' Always emailed, so you hear about it wherever you are.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-5">
                    <span className="flex items-center gap-2 text-[0.75rem] text-muted">
                      <span id={`${base}-app`}>In Dossier</span>
                      <Switch
                        checked={channels.inApp}
                        labelledBy={`${base}-app ${base}`}
                        onChange={(inApp) => set({ inApp })}
                      />
                    </span>
                    <span className="flex items-center gap-2 text-[0.75rem] text-muted">
                      <span id={`${base}-email`}>Email</span>
                      <Switch
                        checked={channels.email}
                        labelledBy={`${base}-email ${base}`}
                        describedBy={
                          event.emailLocked ? `${base}-detail` : undefined
                        }
                        disabled={event.emailLocked}
                        onChange={(email) => set({ email })}
                      />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
