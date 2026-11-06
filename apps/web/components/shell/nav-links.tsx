'use client';

import {
  BellRing,
  Briefcase,
  CalendarDays,
  FileText,
  Newspaper,
  NotebookPen,
  Plug,
  RefreshCcw,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { Suspense, useState } from 'react';
import { Mark } from '@/components/brand/logo';
import { cn } from '@/lib/cn';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon | 'mark';
};

export const NAV_SECTIONS: { label?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: '/', label: 'Today', icon: Newspaper },
      { href: '/ask', label: 'Ask Dossier', icon: 'mark' },
    ],
  },
  {
    label: 'Clients',
    items: [
      { href: '/clients', label: 'All clients', icon: Briefcase },
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
      { href: '/reports', label: 'Reports', icon: FileText },
      { href: '/meetings', label: 'Meetings', icon: CalendarDays },
      { href: '/notes', label: 'Notes', icon: NotebookPen },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { href: '/connections', label: 'Connections', icon: Plug },
      { href: '/audit-log', label: 'Audit log', icon: ScrollText },
    ],
  },
];

/** Quick and settled: the pill arrives in about a quarter second, no bounce. */
const PILL_SPRING = { type: 'spring', stiffness: 520, damping: 42 } as const;

/** The sidebar's links, the current page on a white pill that follows you. */
export function NavLinks() {
  // Needs attention and Renewals are views of the clients page (`?view=`),
  // which only the browser knows; until then, the path alone decides.
  return (
    <Suspense fallback={<NavList view={null} />}>
      <NavListWithView />
    </Suspense>
  );
}

function NavListWithView() {
  return <NavList view={useSearchParams().get('view')} />;
}

function NavList({ view }: { view: string | null }) {
  const pathname = usePathname();
  // The pill moves on the click, not when the page catches up: the link
  // just clicked is lit until the URL changes. aria-current stays with the
  // page actually shown.
  const location = `${pathname}?${view ?? ''}`;
  const [clicked, setClicked] = useState<{ href: string; at: string } | null>(
    null,
  );
  const lit = clicked?.at === location ? clicked.href : null;
  const isCurrent = (href: string) => {
    const [path, query] = href.split('?');
    const itemView = new URLSearchParams(query).get('view');
    if (path === '/') return pathname === '/';
    if (itemView) return pathname === path && view === itemView;
    if (path === '/clients') {
      return (
        (pathname === '/clients' &&
          view !== 'attention' &&
          view !== 'renewals') ||
        pathname.startsWith('/clients/')
      );
    }
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  return (
    <nav aria-label="Main" className="flex flex-col gap-4">
      {NAV_SECTIONS.map((section, index) => (
        <div key={section.label ?? index}>
          {section.label && (
            <p className="mb-1 px-2.5 text-[0.6875rem] text-muted">
              {section.label}
            </p>
          )}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const current = isCurrent(item.href);
              const shown = lit ? item.href === lit : current;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={current ? 'page' : undefined}
                    onNavigate={() =>
                      setClicked({ href: item.href, at: location })
                    }
                    className={cn(
                      'relative isolate flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-small transition-colors',
                      shown ? 'font-medium' : 'hover:bg-white/60',
                    )}
                  >
                    {shown && (
                      // One pill, shared by every link: Framer Motion springs
                      // it from the old page's link to the new one's.
                      <motion.span
                        layoutId="nav-current"
                        aria-hidden
                        className="absolute inset-0 -z-10 rounded-lg bg-white"
                        transition={PILL_SPRING}
                      />
                    )}
                    {Icon === 'mark' ? (
                      <Mark height={13} className="w-4 text-muted" />
                    ) : (
                      <Icon
                        aria-hidden
                        className="size-4 text-muted"
                        strokeWidth={1.75}
                      />
                    )}
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
