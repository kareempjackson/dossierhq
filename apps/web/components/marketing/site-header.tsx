'use client';

import { ChevronDown, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/brand/logo';
import { ButtonLink } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { CONTAINER } from './container';
import { PRODUCT_LINKS, RESOURCE_LINKS, type NavLink } from './links';

type NavItem = { label: string; href?: string; menu?: NavLink[] };

const NAV: NavItem[] = [
  { label: 'Product', menu: PRODUCT_LINKS },
  { label: 'How it works', href: '/welcome#how-it-works' },
  { label: 'Security', href: '/security' },
  { label: 'Resources', menu: RESOURCE_LINKS },
  { label: 'Pricing', href: '/pricing' },
];

/** Every link once, for the folded menu on narrow screens. */
const MOBILE_LINKS = NAV.flatMap(
  (item) => item.menu ?? [{ href: item.href!, label: item.label }],
).filter(
  (link, index, all) =>
    all.findIndex((each) => each.href === link.href) === index,
);

/** The marketing site's top bar; on narrow screens the links fold into a menu. */
export function SiteHeader() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !bar.current?.contains(event.target as Node)
      ) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', close);
    };
  }, []);

  return (
    <header className={cn(CONTAINER, 'relative z-30 pt-5')} ref={bar}>
      <div className="flex items-center justify-between gap-6">
        <Link href="/welcome" aria-label="Dossier, home" className="rounded-sm">
          <Logo height={24} />
        </Link>

        <nav aria-label="Site" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.label} className="relative">
                {item.menu ? (
                  <>
                    <button
                      type="button"
                      aria-expanded={openMenu === item.label}
                      onClick={() =>
                        setOpenMenu(openMenu === item.label ? null : item.label)
                      }
                      className="flex items-center gap-1 rounded-full px-3 py-2 text-small transition-colors hover:bg-grey-1"
                    >
                      {item.label}
                      <ChevronDown
                        aria-hidden
                        className={cn(
                          'size-3.5 transition-transform',
                          openMenu === item.label && 'rotate-180',
                        )}
                      />
                    </button>
                    {openMenu === item.label && (
                      <ul className="absolute top-full left-0 mt-2 w-72 rounded-2xl bg-white p-2 shadow-float">
                        {item.menu.map((link) => (
                          <li key={link.href}>
                            <Link
                              href={link.href}
                              onClick={() => setOpenMenu(null)}
                              className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-grey-1"
                            >
                              <span className="block text-small font-medium">
                                {link.label}
                              </span>
                              {link.detail && (
                                <span className="block text-[0.75rem] text-muted">
                                  {link.detail}
                                </span>
                              )}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <Link
                    href={item.href!}
                    className="block rounded-full px-3 py-2 text-small transition-colors hover:bg-grey-1"
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          {/* Hidden on phones, where the menu has it; a wrapper, so the button's own display doesn't win. */}
          <span className="hidden sm:block">
            <ButtonLink href="/sign-in" variant="outline" size="sm">
              Log in
            </ButtonLink>
          </span>
          <ButtonLink href="/sign-up" variant="act" size="sm">
            Sign up
          </ButtonLink>
          <button
            type="button"
            aria-expanded={mobileOpen}
            aria-controls="site-menu"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMobileOpen(!mobileOpen)}
            className="grid size-9 place-items-center rounded-full bg-grey-1 lg:hidden"
          >
            {mobileOpen ? (
              <X aria-hidden className="size-4" />
            ) : (
              <Menu aria-hidden className="size-4" />
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav
          id="site-menu"
          aria-label="Site"
          className="mt-3 rounded-2xl bg-white p-3 shadow-float lg:hidden"
        >
          <ul className="flex flex-col">
            {MOBILE_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-xl px-3 py-2.5 text-small transition-colors hover:bg-grey-1"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li className="sm:hidden">
              <Link
                href="/sign-in"
                className="block rounded-xl px-3 py-2.5 text-small font-medium hover:bg-grey-1"
              >
                Log in
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
