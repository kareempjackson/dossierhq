'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { Mark } from '@/components/brand/logo';
import { useCommandPalette, useModifierKey } from './command-palette';
import { useShell } from './shell-context';

const noSubscription = () => () => {};

/**
 * The page's name, with today's date or a line about the page under it, and
 * Ask and notifications on the right.
 */
export function TopBar({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="font-display text-h3">{title}</p>
        <p className="mt-0.5 min-h-[1.125rem] text-small text-muted">
          {subtitle ?? <Today />}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <AskBox />
        <NotificationsBell />
      </div>
    </header>
  );
}

/** "Wednesday 4 November", from this browser's clock. */
function Today() {
  return useSyncExternalStore(
    noSubscription,
    () =>
      new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(new Date()),
    () => '',
  );
}

/** Looks like a search field and opens the command palette, as ⌘K (Ctrl K) does. */
function AskBox() {
  const { open } = useCommandPalette();
  const modifier = useModifierKey();
  return (
    <button
      type="button"
      onClick={open}
      aria-keyshortcuts="Meta+K Control+K"
      className="flex h-9 w-72 max-w-full items-center gap-2.5 rounded-full bg-grey-1 px-3.5 text-left text-small text-muted transition-colors hover:bg-grey-2"
    >
      <Mark height={12} />
      <span className="flex-1">Ask about any client</span>
      <kbd className="font-mono text-label tracking-normal">
        {modifier === '⌘' ? '⌘K' : 'Ctrl K'}
      </kbd>
    </button>
  );
}

/** Opens Notifications; a lime badge counts what's unread. */
function NotificationsBell() {
  const { unreadNotifications: unread } = useShell();
  return (
    <Link
      href="/notifications"
      aria-label={
        unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'
      }
      className="relative grid size-9 place-items-center rounded-full bg-grey-1 text-ink transition-colors hover:bg-grey-2"
    >
      <Bell aria-hidden className="size-4" strokeWidth={1.75} />
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-lime px-1 font-mono text-[0.625rem] leading-none tracking-normal text-ink"
        >
          {unread}
        </span>
      )}
    </Link>
  );
}
