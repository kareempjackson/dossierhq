'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useViewNav, ViewLink } from '@/components/ui/view-nav';
import { cn } from '@/lib/cn';
import {
  notificationsHref,
  type NotificationView,
} from '@/lib/notification-views';
import { useAppSelector } from '@/lib/store/hooks';
import { selectUnread } from '@/lib/store/shell-slice';
import { useMarkRead } from './use-mark-read';

const TABS: { view: NotificationView; label: string }[] = [
  { view: 'all', label: 'All' },
  { view: 'unread', label: 'Unread' },
];

/**
 * All or Unread, Mark all as read, and Settings. Drawn in the browser from
 * the URL, so they stay on screen while each view loads and the tab you
 * click lights at once. The unread count comes from the store.
 */
export function NotificationTabs() {
  const view: NotificationView =
    useSearchParams().get('view') === 'unread' ? 'unread' : 'all';
  const unread = useAppSelector(selectUnread);
  const { pending } = useViewNav();
  const { mark, error } = useMarkRead();
  const lit = TABS.find((tab) => notificationsHref(tab.view) === pending);

  return (
    <div className="px-1 pb-3">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <nav aria-label="Which notifications" className="flex gap-1.5">
          {TABS.map((tab) => {
            const on = lit ? tab === lit : tab.view === view;
            return (
              <ViewLink
                key={tab.view}
                href={notificationsHref(tab.view)}
                aria-current={tab.view === view ? 'page' : undefined}
                className={cn(
                  'flex h-10 min-w-24 items-center gap-2 rounded-t-xl rounded-b-md px-4 text-small transition-colors',
                  on
                    ? 'bg-white text-ink'
                    : 'bg-grey-3 text-muted hover:text-ink',
                )}
              >
                {tab.label}
                {tab.view === 'unread' && unread !== null && (
                  <span className="rounded-full bg-white px-1.5 font-mono text-label leading-5 tracking-normal text-muted">
                    {unread}
                  </span>
                )}
              </ViewLink>
            );
          })}
        </nav>
        <div className="flex items-center gap-6 pb-2 text-small">
          <button
            type="button"
            disabled={!unread}
            onClick={() => void mark('all', true)}
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
      {error && (
        <p role="alert" className="mt-2 text-small text-attention">
          {error}
        </p>
      )}
    </div>
  );
}
