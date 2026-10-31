import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { signOut } from '@/app/auth-actions';
import { cn } from '@/lib/cn';
import { getMe } from '@/lib/data';
import { orNull } from '@/lib/data/safe';
import { NavLinks, NavList, type NavItem } from './nav-links';

export const navItems: NavItem[] = [
  {
    href: '/',
    label: 'Workspaces',
    icon: 'workspaces',
    match: ['/', '/workspaces'],
  },
  { href: '/people', label: 'People', icon: 'people', match: ['/people'] },
  { href: '/support', label: 'Support', icon: 'support', match: ['/support'] },
  { href: '/staff', label: 'Staff', icon: 'staff', match: ['/staff'] },
  {
    href: '/activity',
    label: 'Activity',
    icon: 'activity',
    match: ['/activity'],
  },
];

/**
 * A dark band down the side, labelled Admin, so the admin app is never
 * mistaken for a workspace. Stacked on top on narrow screens.
 */
export function Sidebar() {
  return (
    <aside
      aria-label="Dossier Admin"
      className="flex flex-col gap-3 rounded-sheet bg-night p-3 text-white md:h-full md:w-56 md:shrink-0 md:gap-6 md:overflow-y-auto"
    >
      <Link
        href="/"
        className="flex items-center gap-2 rounded-row px-1.5 pt-1"
      >
        <span className="text-wordmark font-semibold">Dossier</span>
        <span className="rounded-full bg-mint/15 px-2 py-0.5 text-meta-sm font-medium text-mint">
          Admin
        </span>
      </Link>

      <nav aria-label="Main">
        <Suspense fallback={<NavList items={navItems} pathname={null} />}>
          <NavLinks items={navItems} />
        </Suspense>
      </nav>

      <Suspense fallback={<StaffChipSkeleton className="mt-auto" />}>
        <StaffChip className="mt-auto" />
      </Suspense>
    </aside>
  );
}

/** Who is signed in, and the way out. */
async function StaffChip({ className }: { className?: string }) {
  const me = await getMe().catch(orNull);
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2.5 rounded-full bg-white/8 p-1.5',
        className,
      )}
    >
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center rounded-full bg-mint text-meta-sm font-semibold text-night"
      >
        {me?.staff.name.charAt(0) ?? 'D'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-meta font-medium">
          {me?.staff.name ?? 'Couldn’t load your account'}
        </span>
        <span className="block truncate text-meta-sm text-white/60">
          {me ? (me.staff.role === 'admin' ? 'Admin' : 'Support') : ''}
        </span>
      </span>
      <form action={signOut} className="shrink-0">
        <button
          type="submit"
          aria-label="Sign out"
          title="Sign out"
          className="grid size-8 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut aria-hidden className="size-4" strokeWidth={1.75} />
        </button>
      </form>
    </div>
  );
}

function StaffChipSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('h-10 rounded-full bg-white/8', className)}
    />
  );
}
