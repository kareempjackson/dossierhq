'use client';

import {
  Briefcase,
  FileText,
  LayoutGrid,
  Newspaper,
  type LucideIcon,
} from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Mark } from '@/components/brand/logo';
import { cn } from '@/lib/cn';
import { tabFor, type MobileTab } from '@/lib/mobile-nav';
import { MoreSheet } from './more-sheet';

type Tab = {
  id: MobileTab;
  label: string;
  icon: LucideIcon | 'mark';
  /** Absent for More, which opens a sheet instead of a page. */
  href?: string;
};

const TABS: Tab[] = [
  { id: 'today', href: '/', label: 'Today', icon: Newspaper },
  { id: 'clients', href: '/clients', label: 'Clients', icon: Briefcase },
  { id: 'ask', href: '/ask', label: 'Ask', icon: 'mark' },
  { id: 'reports', href: '/reports', label: 'Reports', icon: FileText },
  { id: 'more', label: 'More', icon: LayoutGrid },
];

/** The same quick, settled spring as the sidebar's pill. */
const PILL_SPRING = { type: 'spring', stiffness: 520, damping: 42 } as const;

/**
 * The phone's way around, below the sidebar's width: four places and More,
 * along the bottom where a thumb reaches. The tab lights on the tap, before
 * the page arrives; tapping the tab you're on takes you back to its top.
 * It steps aside while the keyboard is up.
 */
export function TabBar() {
  const pathname = usePathname();
  const current = tabFor(pathname);
  const [moreOpen, setMoreOpen] = useState(false);
  const [tapped, setTapped] = useState<{ id: MobileTab; at: string } | null>(
    null,
  );
  const typing = useTyping();
  const lit = moreOpen ? 'more' : tapped?.at === pathname ? tapped.id : current;

  return (
    <>
      <nav
        aria-label="Main"
        className={cn(
          'fixed inset-x-0 bottom-0 z-30 bg-white/85 pb-safe shadow-[0_-1px_0_var(--color-grey-2)] backdrop-blur-xl backdrop-saturate-150 transition-transform duration-200 lg:hidden',
          typing && 'translate-y-full',
        )}
      >
        <ul className="mx-auto grid h-16 max-w-xl grid-cols-5 px-1">
          {TABS.map((tab) => {
            const on = lit === tab.id;
            const body = (
              <>
                <span className="relative grid h-8 w-14 place-items-center">
                  {on && (
                    <motion.span
                      layoutId="tab-current"
                      aria-hidden
                      className="absolute inset-0 rounded-full bg-grey-2"
                      transition={PILL_SPRING}
                    />
                  )}
                  <TabIcon icon={tab.icon} on={on} />
                </span>
                <span
                  className={cn(
                    'text-[0.6875rem] leading-none',
                    on ? 'font-medium text-ink' : 'text-muted',
                  )}
                >
                  {tab.label}
                </span>
              </>
            );
            const shape =
              'press flex h-full w-full flex-col items-center justify-center gap-1 select-none';
            return (
              <li key={tab.id}>
                {tab.href ? (
                  <Link
                    href={tab.href}
                    aria-current={current === tab.id ? 'page' : undefined}
                    className={shape}
                    onClick={(event) => {
                      // Already here: back to the top, as native tabs do.
                      if (pathname === tab.href) {
                        event.preventDefault();
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                    onNavigate={() => setTapped({ id: tab.id, at: pathname })}
                  >
                    {body}
                  </Link>
                ) : (
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-expanded={moreOpen}
                    aria-current={current === tab.id ? 'page' : undefined}
                    className={shape}
                    onClick={() => setMoreOpen(true)}
                  >
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}

function TabIcon({ icon: Icon, on }: { icon: Tab['icon']; on: boolean }) {
  const tone = on ? 'text-ink' : 'text-muted';
  return Icon === 'mark' ? (
    <Mark height={17} className={cn('relative', tone)} />
  ) : (
    <Icon
      aria-hidden
      className={cn('relative size-5', tone)}
      strokeWidth={on ? 2 : 1.75}
    />
  );
}

const TEXT_INPUT = /^(text|search|email|url|tel|password|number|date|)$/;

/** Whether a field that brings up the on-screen keyboard has focus. */
function useTyping() {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isField = (target: EventTarget | null) =>
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable) ||
      (target instanceof HTMLInputElement && TEXT_INPUT.test(target.type));
    const onFocus = (event: FocusEvent) => setTyping(isField(event.target));
    const onBlur = (event: FocusEvent) => {
      if (!isField(event.relatedTarget)) setTyping(false);
    };
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onBlur);
    return () => {
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onBlur);
    };
  }, []);
  return typing;
}
