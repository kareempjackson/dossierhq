'use client';

import {
  BellRing,
  CalendarDays,
  ChevronRight,
  NotebookPen,
  Plug,
  RefreshCcw,
  ScrollText,
  Settings,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { useAppSelector } from '@/lib/store/hooks';
import { selectUser, selectWorkspaceName } from '@/lib/store/session-slice';
import { initials } from './sidebar-user';

type Item = { href: string; label: string; icon: LucideIcon };

/** Everything the sidebar has that the tab bar doesn't, grouped as there. */
const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: 'Clients',
    items: [
      {
        href: '/clients?view=attention',
        label: 'Needs attention',
        icon: BellRing,
      },
      { href: '/clients?view=renewals', label: 'Renewals', icon: RefreshCcw },
    ],
  },
  {
    label: 'Work',
    items: [
      { href: '/meetings', label: 'Meetings', icon: CalendarDays },
      { href: '/notes', label: 'Notes', icon: NotebookPen },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { href: '/connections', label: 'Connections', icon: Plug },
      { href: '/audit-log', label: 'Audit log', icon: ScrollText },
      { href: '/intelligence', label: 'Intelligence', icon: Sparkles },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

/**
 * The tab bar's More: who's signed in, and the rest of the workspace, in
 * grouped lists as a phone's settings are. Choosing a page closes it.
 */
export function MoreSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      label="More"
      header={<Account onOpen={onClose} />}
    >
      <div className="flex flex-col gap-5 px-4 pt-2 pb-6">
        {GROUPS.map((group) => (
          <section key={group.label}>
            <h2 className="mb-1.5 px-4 font-sans text-[0.6875rem] tracking-normal text-muted">
              {group.label}
            </h2>
            <Suspense
              fallback={
                <Group items={group.items} view={null} onChoose={onClose} />
              }
            >
              <GroupWithView items={group.items} onChoose={onClose} />
            </Suspense>
          </section>
        ))}
      </div>
    </Sheet>
  );
}

/** Needs attention and Renewals are `?view=`s, which only the browser knows. */
function GroupWithView({
  items,
  onChoose,
}: {
  items: Item[];
  onChoose: () => void;
}) {
  return (
    <Group
      items={items}
      view={useSearchParams().get('view')}
      onChoose={onChoose}
    />
  );
}

function Group({
  items,
  view,
  onChoose,
}: {
  items: Item[];
  view: string | null;
  onChoose: () => void;
}) {
  const pathname = usePathname();
  const isCurrent = (href: string) => {
    const [path, query] = href.split('?');
    const itemView = new URLSearchParams(query).get('view');
    if (itemView) return pathname === path && view === itemView;
    return pathname === path || pathname.startsWith(`${path}/`);
  };
  return (
    <ul className="overflow-hidden rounded-2xl bg-grey-1">
      {items.map((item, index) => {
        const current = isCurrent(item.href);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onChoose}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'flex h-13 items-center gap-3.5 px-4 transition-colors active:bg-grey-2',
                current && 'bg-grey-2 font-medium',
              )}
            >
              <Icon
                aria-hidden
                className="size-[1.125rem] shrink-0 text-muted"
                strokeWidth={1.75}
              />
              <span
                className={cn(
                  'flex h-full flex-1 items-center',
                  // Grey on grey, in place of a line between rows.
                  index > 0 && 'shadow-[0_-1px_0_var(--color-white)]',
                )}
              >
                {item.label}
              </span>
              <ChevronRight
                aria-hidden
                className="size-4 shrink-0 text-muted"
                strokeWidth={1.75}
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Who's signed in and where, opening their settings. */
function Account({ onOpen }: { onOpen: () => void }) {
  const user = useAppSelector(selectUser);
  const workspace = useAppSelector(selectWorkspaceName);
  return (
    <Link
      href="/settings"
      onClick={onOpen}
      className="mx-4 mt-2 mb-3 flex items-center gap-3 rounded-2xl px-1 py-2 transition-colors active:bg-grey-1"
    >
      <span
        aria-hidden
        className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-small font-medium text-paper"
      >
        {user ? initials(user.name) : ''}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {user?.name ?? 'Your account'}
        </span>
        <span className="block truncate text-small text-muted">
          {workspace ?? 'Settings'}
        </span>
      </span>
      <ChevronRight
        aria-hidden
        className="size-4 shrink-0 text-muted"
        strokeWidth={1.75}
      />
    </Link>
  );
}
