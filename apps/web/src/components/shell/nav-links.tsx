'use client';

import {
  Building2,
  FileText,
  House,
  NotebookPen,
  Plug,
  ScrollText,
  Settings,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { StatusDot } from '@/components/ui/status-dot';
import { cn } from '@/lib/cn';

const icons = {
  home: House,
  clients: Building2,
  reports: FileText,
  notes: NotebookPen,
  connections: Plug,
  intelligence: Sparkles,
  audit: ScrollText,
  settings: Settings,
} satisfies Record<string, LucideIcon>;

export type NavItem = {
  href: string;
  label: string;
  icon: keyof typeof icons;
  /** Path prefix that marks the item active. Omit to never mark it. */
  match?: string;
  /** Number shown at the end of the row, e.g. reports to review. */
  count?: { value: number; label: string };
  /** Shows a failure dot, e.g. "1 connection failing". */
  failure?: string;
};

/** Main navigation with the current page marked. */
export function NavLinks({ items }: { items: NavItem[] }) {
  return <NavList items={items} pathname={usePathname()} />;
}

/** The same list without reading the URL, used while it is unknown. */
export function NavList({
  items,
  pathname,
}: {
  items: NavItem[];
  pathname: string | null;
}) {
  return (
    <ul className="flex flex-wrap gap-1 md:flex-col md:flex-nowrap">
      {items.map((item) => {
        const active =
          pathname !== null &&
          item.match !== undefined &&
          (item.match === '/'
            ? pathname === '/'
            : pathname.startsWith(item.match));
        const Icon = icons[item.icon];

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-9 items-center gap-2.5 rounded-full px-3 text-body transition-colors',
                active
                  ? 'bg-sheet text-ink shadow-card'
                  : 'text-muted-on-ground hover:bg-sheet/60 hover:text-ink',
              )}
            >
              <Icon
                aria-hidden
                className="size-4 shrink-0"
                strokeWidth={1.75}
              />
              {item.label}
              {item.count && (
                <span className="ml-auto pl-2 text-meta tabular-nums">
                  {item.count.value}
                  <span className="sr-only"> {item.count.label}</span>
                </span>
              )}
              {item.failure && (
                <StatusDot
                  tone="failure"
                  srLabel={item.failure}
                  className="ml-auto pl-2"
                />
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
