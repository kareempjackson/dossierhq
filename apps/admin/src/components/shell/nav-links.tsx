'use client';

import {
  Building2,
  LifeBuoy,
  ScrollText,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const icons = {
  workspaces: Building2,
  people: Users,
  support: LifeBuoy,
  staff: ShieldCheck,
  activity: ScrollText,
} satisfies Record<string, LucideIcon>;

export type NavItem = {
  href: string;
  label: string;
  icon: keyof typeof icons;
  /** Path prefixes that mark the item active; `/` matches only itself. */
  match: string[];
  /** Number shown at the end of the row, e.g. live support views. */
  count?: { value: number; label: string };
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
          item.match.some((prefix) =>
            prefix === '/' ? pathname === '/' : pathname.startsWith(prefix),
          );
        const Icon = icons[item.icon];
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-9 items-center gap-2.5 rounded-full px-3 text-body transition-colors',
                active
                  ? 'bg-white/12 text-white'
                  : 'text-white/70 hover:bg-white/6 hover:text-white',
              )}
            >
              <Icon
                aria-hidden
                className="size-4 shrink-0"
                strokeWidth={1.75}
              />
              {item.label}
              {item.count && (
                <span className="ml-auto pl-2 text-meta text-mint tabular-nums">
                  {item.count.value}
                  <span className="sr-only"> {item.count.label}</span>
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
