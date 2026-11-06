import Link from 'next/link';
import { Logo, Mark } from '@/components/brand/logo';
import { cn } from '@/lib/cn';
import { CONTAINER } from './container';
import { PRODUCT_LINKS, RESOURCE_LINKS } from './links';
import { UpdatesForm } from './updates-form';

const GROUPS = [
  { name: 'Product', tone: 'bg-lime', links: PRODUCT_LINKS },
  {
    name: 'Company',
    tone: 'bg-lilac',
    links: [
      { href: '/about', label: 'About Ghost Savvy' },
      { href: '/careers', label: 'Careers' },
      { href: 'mailto:hello@dossierhq.com', label: 'Contact' },
      { href: '/press', label: 'Press kit' },
    ],
  },
  { name: 'Resources', tone: 'bg-paper', links: RESOURCE_LINKS },
  {
    name: 'Legal',
    tone: 'bg-stone',
    links: [
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
      { href: '/dpa', label: 'DPA' },
      { href: '/cookies', label: 'Cookies' },
    ],
  },
];

/** Deep, with four link folders, the updates sign-up and the wordmark cut off at the bottom. */
export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden bg-deep pt-20 text-paper">
      <div className={CONTAINER}>
        <nav aria-label="Footer">
          <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {GROUPS.map((group, index) => (
              <li
                key={group.name}
                className={cn(
                  'relative text-ink lg:mt-0',
                  index % 2 === 1 && 'lg:mt-3',
                  index > 1 && 'lg:mt-6',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-fit items-start rounded-t-lg px-3 pt-1.5 text-[0.75rem]',
                    group.tone,
                  )}
                >
                  <span className="mr-1.5 font-mono tracking-normal">
                    0{index + 1}
                  </span>
                  {group.name}
                </span>
                <ul
                  className={cn(
                    'flex min-h-40 flex-col gap-2 rounded-xl rounded-tl-none p-4 text-small',
                    group.tone,
                  )}
                >
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="rounded-sm hover:underline"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-14 flex flex-wrap items-center justify-between gap-6">
          <p className="flex items-center gap-3 text-small">
            <Mark height={18} className="text-paper" />
            One file per client.
          </p>
          <UpdatesForm />
        </div>
        <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-paper/10 pt-6 text-[0.75rem] text-paper/60">
          <p>© 2026 Ghost Savvy. Dossier reads; it never writes.</p>
          <p>Made in Lagos and London.</p>
        </div>
      </div>
      <div aria-hidden className={cn(CONTAINER, 'mt-10 overflow-hidden')}>
        <Logo
          height={240}
          className="h-auto w-full translate-y-[28%] text-white/[0.07]"
        />
      </div>
    </footer>
  );
}
