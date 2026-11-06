'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ButtonLink } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { Notification } from '@/lib/workspace';

const VIEWS = ['all', 'unread'] as const;

/**
 * Everything that happened, or only what's unread. Unread items are white
 * with a lime edge. Marking them read happens here in the browser for now.
 */
export function NotificationList({
  notifications,
}: {
  notifications: Notification[];
}) {
  const [view, setView] = useState<(typeof VIEWS)[number]>('all');
  const [read, setRead] = useState<Set<string>>(() => new Set());
  const isUnread = (item: Notification) => item.unread && !read.has(item.id);
  const unreadCount = notifications.filter(isUnread).length;
  const shown =
    view === 'unread' ? notifications.filter(isUnread) : notifications;
  const markRead = (ids: string[]) =>
    setRead((current) => new Set([...current, ...ids]));

  return (
    <div className="rounded-3xl bg-grey-2 p-2.5 sm:p-3 lg:min-h-[calc(100dvh-10rem)]">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-1 pb-3">
        <div
          role="group"
          aria-label="Which notifications"
          className="flex gap-1.5"
        >
          {VIEWS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={cn(
                'flex h-10 min-w-24 items-center gap-2 rounded-t-xl rounded-b-md px-4 text-small transition-colors',
                view === value
                  ? 'bg-white text-ink'
                  : 'bg-grey-3 text-muted hover:text-ink',
              )}
            >
              {value === 'all' ? 'All' : 'Unread'}
              {value === 'unread' && (
                <span className="rounded-full bg-white px-1.5 font-mono text-label leading-5 tracking-normal text-muted">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-6 pb-2 text-small">
          <button
            type="button"
            disabled={unreadCount === 0}
            onClick={() => markRead(notifications.map((item) => item.id))}
            className="rounded-sm font-medium text-ink disabled:cursor-default disabled:text-muted"
          >
            Mark all as read
          </button>
          <Link
            href="/settings"
            className="rounded-sm text-muted transition-colors hover:text-ink"
          >
            Settings
          </Link>
        </div>
      </div>

      {shown.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {shown.map((item) => {
            const unread = isUnread(item);
            return (
              <li
                key={item.id}
                className={cn(
                  'relative flex flex-wrap items-center gap-x-6 gap-y-2 overflow-hidden rounded-xl px-5 py-3.5',
                  unread ? 'bg-white' : 'bg-grey-1',
                )}
              >
                {unread && (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-[3px] bg-lime"
                  />
                )}
                <div className="min-w-[14rem] flex-1 basis-full sm:basis-0">
                  <p className={unread ? 'font-semibold' : undefined}>
                    {unread && <span className="sr-only">Unread: </span>}
                    {item.title}
                  </p>
                  <p className="text-small text-muted">{item.body}</p>
                </div>
                <p className="text-small text-muted sm:w-24 sm:text-right">
                  {item.when}
                </p>
                <div className="ml-auto sm:ml-0 sm:flex sm:w-28 sm:justify-end">
                  {item.action && (
                    <ButtonLink
                      href={item.action.href}
                      variant="outline"
                      size="sm"
                      onClick={() => markRead([item.id])}
                    >
                      {item.action.label}
                    </ButtonLink>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-xl bg-grey-1 px-5 py-10 text-center">
          <p className="font-display text-h3">Nothing unread.</p>
          <p className="mt-1 text-small text-muted">
            You’re up to date. New activity lands here.
          </p>
        </div>
      )}
    </div>
  );
}
