'use client';

import type { Notification, NotificationCategory } from '@dossierhq/contracts';
import {
  FileText,
  Plug,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useState, useTransition } from 'react';
import {
  markAllNotificationsRead,
  markNotificationsRead,
  openNotification,
} from '@/app/notification-actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

export const CATEGORY_ICONS = {
  connections: Plug,
  reports: FileText,
  team: Users,
  security: ShieldCheck,
  intelligence: Sparkles,
} satisfies Record<NotificationCategory, LucideIcon>;

/**
 * One notification: opening it marks it read and goes to the page it's
 * about. Unread ones are marked with a dot and can be marked read in place.
 */
export function NotificationItem({
  notification,
  when,
}: {
  notification: Notification;
  /** When it happened, already worded, e.g. "6 min ago". */
  when: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const Icon = CATEGORY_ICONS[notification.category];
  const unread = notification.readAt === null;
  const { link } = notification;

  const run = (action: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? 'Couldn’t do that.');
    });
  };

  const content = (
    <>
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-tile bg-surface text-ink"
      >
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-body text-ink',
            unread ? 'font-semibold' : 'font-medium',
          )}
        >
          {notification.title}
          {unread && <span className="sr-only"> (unread)</span>}
        </span>
        {notification.body && (
          <span className="mt-0.5 block text-meta text-muted">
            {notification.body}
          </span>
        )}
        <time
          dateTime={notification.at}
          className="mt-1 block text-meta-sm text-muted"
        >
          {when}
        </time>
      </span>
    </>
  );

  return (
    <li>
      <div className="flex items-start gap-2 pr-3">
        {link ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => openNotification(notification.id, link))}
            className="flex min-w-0 flex-1 gap-3 px-4 py-3.5 text-left transition-colors -outline-offset-2 hover:bg-surface-soft disabled:opacity-60"
          >
            {content}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 gap-3 px-4 py-3.5">{content}</div>
        )}
        <div className="flex shrink-0 items-center gap-2 pt-3.5">
          {unread && (
            <>
              <span aria-hidden className="size-2 rounded-full bg-brand" />
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  run(() => markNotificationsRead([notification.id]))
                }
              >
                Mark read
              </Button>
            </>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="px-4 pb-3 pl-16 text-meta text-alert">
          {error}
        </p>
      )}
    </li>
  );
}

export function MarkAllRead() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-3">
      {error && (
        <p role="alert" className="text-meta text-alert">
          {error}
        </p>
      )}
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const result = await markAllNotificationsRead();
            if (!result.ok) setError(result.error);
          });
        }}
      >
        Mark all read
      </Button>
    </div>
  );
}
