'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Mark } from '@/components/brand/logo';
import { cn } from '@/lib/cn';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import {
  pageTitleGone,
  pageTitleScrolled,
  pageTitleShown,
  selectUnread,
} from '@/lib/store/shell-slice';
import { useCommandPalette, useModifierKey } from './command-palette';
import { MOBILE_HEADER } from '@/lib/mobile-nav';

const noSubscription = () => () => {};

/**
 * The page's name, with today's date or a line about the page under it, and
 * Ask and notifications on the right. On a phone the name is the page's big
 * title, and Ask and notifications live in the bar above (MobileHeader),
 * which takes the name over once it scrolls away.
 */
export function TopBar({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const heading = useTitleForMobileHeader(title);
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <p ref={heading} className="font-display text-h2 lg:text-h3">
          {title}
        </p>
        <p className="mt-0.5 min-h-[1.125rem] text-small text-muted">
          {subtitle ?? <Today />}
        </p>
      </div>
      <div className="hidden flex-wrap items-center gap-3 lg:flex">
        <AskBox />
        <NotificationsBell />
      </div>
    </header>
  );
}

/**
 * Tells the phone's top bar this page's name, and whether the big title
 * has scrolled up under the bar, so the bar can show the name instead.
 */
function useTitleForMobileHeader(title: string) {
  const dispatch = useAppDispatch();
  const heading = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    dispatch(pageTitleShown(title));
    const element = heading.current;
    const bar = document.querySelector(`[${MOBILE_HEADER}]`);
    const barHeight = bar?.getBoundingClientRect().height ?? 0;
    let observer: IntersectionObserver | undefined;
    if (element && barHeight > 0) {
      observer = new IntersectionObserver(
        ([entry]) =>
          dispatch(
            pageTitleScrolled(
              !entry.isIntersecting && entry.boundingClientRect.top < barHeight,
            ),
          ),
        { rootMargin: `-${Math.round(barHeight)}px 0px 0px 0px` },
      );
      observer.observe(element);
    }
    return () => {
      observer?.disconnect();
      dispatch(pageTitleGone(title));
    };
  }, [dispatch, title]);

  return heading;
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

/**
 * Opens Notifications; a lime badge counts what's unread. Plain, it sits on
 * the phone's top bar with no circle of its own.
 */
export function NotificationsBell({ plain = false }: { plain?: boolean }) {
  const unread = useAppSelector(selectUnread) ?? 0;
  return (
    <Link
      href="/notifications"
      aria-label={
        unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'
      }
      className={cn(
        'relative grid place-items-center rounded-full text-ink transition-colors',
        plain
          ? 'press size-11 active:bg-grey-1'
          : 'size-9 bg-grey-1 hover:bg-grey-2',
      )}
    >
      <Bell
        aria-hidden
        className={plain ? 'size-5' : 'size-4'}
        strokeWidth={1.75}
      />
      {unread > 0 && (
        <span
          aria-hidden
          className={cn(
            'absolute grid h-4 min-w-4 place-items-center rounded-full bg-lime px-1 font-mono text-[0.625rem] leading-none tracking-normal text-ink',
            plain ? 'top-1.5 right-1' : '-top-1 -right-1',
          )}
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
