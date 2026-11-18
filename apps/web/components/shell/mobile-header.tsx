'use client';

import { ChevronLeft, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';
import { cn } from '@/lib/cn';
import { MOBILE_HEADER, parentOf } from '@/lib/mobile-nav';
import { useAppSelector } from '@/lib/store/hooks';
import { selectPage } from '@/lib/store/shell-slice';
import { useCommandPalette } from './command-palette';
import { NotificationsBell } from './top-bar';

/**
 * The bar along the top of a phone's screen, below the sidebar's width:
 * the logo, or a way back up from a page inside another; search and
 * notifications on the right. The page's name settles into the middle once
 * its big title scrolls away under the bar, and a hairline appears as the
 * page slides beneath it. Anything in `banner` (a support view's notice)
 * rides above it.
 */
export function MobileHeader({ banner }: { banner?: ReactNode }) {
  const pathname = usePathname();
  const parent = parentOf(pathname);
  const page = useAppSelector(selectPage);
  const scrolled = useScrolled();
  const { open } = useCommandPalette();

  return (
    <div
      {...{ [MOBILE_HEADER]: '' }}
      className={cn(
        'sticky top-0 z-30 pt-safe transition-shadow duration-200 max-lg:bg-white/85 max-lg:backdrop-blur-xl max-lg:backdrop-saturate-150',
        scrolled && 'max-lg:shadow-[0_1px_0_var(--color-grey-2)]',
      )}
    >
      {banner}
      <div className="grid h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-2 sm:px-6 lg:hidden">
        <div className="flex min-w-0 items-center">
          {parent ? (
            <Link
              href={parent.href}
              className="press -ml-1 flex h-11 min-w-0 items-center gap-0.5 rounded-full pr-3 pl-1 text-ink active:bg-grey-1"
            >
              <ChevronLeft
                aria-hidden
                className="size-6 shrink-0"
                strokeWidth={1.75}
              />
              <span className="truncate text-body">{parent.label}</span>
            </Link>
          ) : (
            <Link
              href="/"
              aria-label="Dossier, today"
              className="press ml-2 rounded-sm"
            >
              <Logo height={19} />
            </Link>
          )}
        </div>

        <p
          aria-hidden={!page.titleScrolledAway}
          className={cn(
            'max-w-[46vw] truncate text-center font-medium transition-[opacity,translate] duration-200',
            page.titleScrolledAway && page.title
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-1 opacity-0',
          )}
        >
          {page.title}
        </p>

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={open}
            aria-label="Search and ask"
            className="press grid size-11 place-items-center rounded-full text-ink active:bg-grey-1"
          >
            <Search aria-hidden className="size-5" strokeWidth={1.75} />
          </button>
          <NotificationsBell plain />
        </div>
      </div>
    </div>
  );
}

/** Whether the page has moved up under the bar. */
function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const check = () => setScrolled(window.scrollY > 2);
    check();
    window.addEventListener('scroll', check, { passive: true });
    return () => window.removeEventListener('scroll', check);
  }, []);
  return scrolled;
}
