import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type FolderTab = {
  href: string;
  label: string;
  count?: number;
  current: boolean;
};

/**
 * File dividers on the grey panel: the current tab is white and joins the
 * sheet below it, the rest step back in grey. Actions sit to the right.
 * Scrolls sideways when the tabs don't fit.
 */
export function FolderTabs({
  label,
  tabs,
  actions,
  onNavigate,
}: {
  label: string;
  tabs: FolderTab[];
  actions?: ReactNode;
  /**
   * Takes over a click that would move within the app, for tabs that only
   * change what's shown (say, with `history.pushState`). Opening a tab in
   * a new tab still follows the link.
   */
  onNavigate?: (href: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <nav
        aria-label={label}
        className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1"
      >
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            onNavigate={
              onNavigate &&
              ((event) => {
                event.preventDefault();
                onNavigate(tab.href);
              })
            }
            aria-current={tab.current ? 'page' : undefined}
            className={cn(
              'flex h-10 shrink-0 items-center gap-2 rounded-t-xl px-4 text-small whitespace-nowrap transition-colors',
              tab.current
                ? 'bg-white text-ink'
                : 'mb-1 rounded-b-md bg-grey-3 text-muted hover:text-ink',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="rounded-full bg-grey-1 px-1.5 font-mono text-label leading-5 tracking-normal text-muted">
                {tab.count}
              </span>
            )}
          </Link>
        ))}
      </nav>
      {actions && <div className="mb-2 flex gap-2">{actions}</div>}
    </div>
  );
}

/** The white sheet under FolderTabs: square at the top left under the first tab. */
export function FolderSheet({
  joinsFirstTab,
  className,
  children,
}: {
  joinsFirstTab: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl bg-white',
        joinsFirstTab && 'rounded-tl-none',
        className,
      )}
    >
      {children}
    </div>
  );
}
