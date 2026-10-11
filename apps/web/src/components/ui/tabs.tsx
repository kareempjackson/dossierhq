import Link from 'next/link';
import { cn } from '@/lib/cn';

type Tab = { href: string; label: string; count?: number };

type TabsProps = {
  /** Names the navigation landmark, e.g. "Client sections". */
  label: string;
  tabs: Tab[];
  /** The href of the current tab. */
  current: string;
  className?: string;
};

/** Underlined tabs that navigate between pages. */
export function Tabs({ label, tabs, current, className }: TabsProps) {
  return (
    <nav aria-label={label} className={cn('overflow-x-auto', className)}>
      <ul className="flex min-w-max gap-6 border-b border-hairline">
        {tabs.map((tab) => {
          const active = tab.href === current;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-px flex h-10 items-center gap-1.5 border-b-2 text-body transition-colors -outline-offset-2',
                  active
                    ? 'border-ink text-ink'
                    : 'border-transparent text-muted hover:text-ink',
                )}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span className="text-meta text-muted tabular-nums">
                    {tab.count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
