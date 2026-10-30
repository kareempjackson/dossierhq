'use client';

import {
  NOTIFICATION_CATEGORIES,
  type EventType,
  type NotificationChannel,
  type NotificationSetting,
} from '@dossierhq/contracts';
import { useId, useState, useTransition } from 'react';
import { setNotificationChannel } from '@/app/notification-actions';
import { CATEGORY_ICONS } from '@/components/notifications/notification-list';
import { Feedback, SettingRow, type Message } from './setting-row';
import { ListCard } from '@/components/ui/list-card';
import { Switch } from '@/components/ui/switch';

const CHANNELS: { id: NotificationChannel; label: string }[] = [
  { id: 'inApp', label: 'In Dossier' },
  { id: 'email', label: 'Email' },
];

/**
 * What you hear about, and how, grouped as Dossier groups them. Each switch
 * saves at once; emails about your own sign-in can't be turned off.
 */
export function NotificationSettings({
  settings,
}: {
  settings: NotificationSetting[];
}) {
  const [current, setCurrent] = useState(settings);
  const [message, setMessage] = useState<(Message & { at: EventType }) | null>(
    null,
  );
  const [, startSaving] = useTransition();

  function change(type: EventType, channel: NotificationChannel, on: boolean) {
    const previous = current;
    setCurrent(
      current.map((s) => (s.type === type ? { ...s, [channel]: on } : s)),
    );
    setMessage(null);
    startSaving(async () => {
      const result = await setNotificationChannel(type, channel, on);
      if (!result.ok) {
        setCurrent(previous);
        setMessage({ at: type, text: result.error, failed: true });
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {NOTIFICATION_CATEGORIES.map((category) => {
        const rows = current.filter((s) => s.category === category.id);
        if (rows.length === 0) return null;
        return (
          <div key={category.id}>
            <h3 className="text-body font-medium text-ink">{category.name}</h3>
            <p className="mt-0.5 text-meta text-muted">
              {category.description}
            </p>
            <ListCard className="mt-3">
              {rows.map((setting) => (
                <Row
                  key={setting.type}
                  setting={setting}
                  onChange={change}
                  message={message?.at === setting.type ? message : null}
                />
              ))}
            </ListCard>
          </div>
        );
      })}
    </div>
  );
}

function Row({
  setting,
  onChange,
  message,
}: {
  setting: NotificationSetting;
  onChange: (
    type: EventType,
    channel: NotificationChannel,
    on: boolean,
  ) => void;
  message: Message | null;
}) {
  const id = useId();
  const emailLocked = setting.locked.includes('email');
  return (
    <SettingRow
      icon={CATEGORY_ICONS[setting.category]}
      title={setting.label}
      description={
        <span id={`${id}-about`}>
          {setting.description}
          {emailLocked &&
            ' Always emailed, so you hear about it wherever you are.'}
        </span>
      }
      feedback={<Feedback message={message} />}
      action={CHANNELS.map((channel) => {
        const locked = setting.locked.includes(channel.id);
        return (
          <span
            key={channel.id}
            className="flex items-center gap-2 text-meta text-muted"
          >
            <span aria-hidden>{channel.label}</span>
            <Switch
              checked={setting[channel.id]}
              disabled={locked}
              label={`${channel.label}: ${setting.label}`}
              describedBy={`${id}-about`}
              onChange={(on) => onChange(setting.type, channel.id, on)}
            />
          </span>
        );
      })}
    />
  );
}
