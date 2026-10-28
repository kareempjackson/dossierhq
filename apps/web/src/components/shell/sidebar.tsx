import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  getConnectors,
  getRecentClients,
  getMe,
  getReportSummaries,
} from '@/lib/data';
import { signOut } from '@/app/auth-actions';
import { cn } from '@/lib/cn';
import { AskDossierLink } from './ask-dossier-link';
import { NavLinks, NavList, type NavItem } from './nav-links';
import { orEmpty, orNull } from '@/lib/data/safe';

const baseNavItems: NavItem[] = [
  { href: '/', label: 'Home', icon: 'home', match: '/' },
  { href: '/clients', label: 'Clients', icon: 'clients', match: '/clients' },
  { href: '/reports', label: 'Reports', icon: 'reports', match: '/reports' },
  {
    href: '/connections',
    label: 'Connections',
    icon: 'connections',
    match: '/connections',
  },
  {
    href: '/intelligence',
    label: 'Intelligence',
    icon: 'intelligence',
    match: '/intelligence',
  },
  {
    href: '/audit-log',
    label: 'Audit log',
    icon: 'audit',
    match: '/audit-log',
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: 'settings',
    match: '/settings',
  },
];

/**
 * Sits directly on the ground. Beside the sheet from 768px; stacked above it
 * on narrower screens, where recent clients are left out to keep it short.
 */
export function Sidebar() {
  return (
    <aside
      aria-label="Workspace"
      className="flex flex-col gap-3 px-1 pt-1 md:h-full md:w-55 md:shrink-0 md:gap-6 md:overflow-y-auto md:px-1.5 md:pt-3 md:pb-1"
    >
      <div className="flex items-center justify-between gap-3 md:px-1.5">
        <Link
          href="/"
          className="rounded-row text-wordmark font-semibold text-ink"
        >
          Dossier
        </Link>
        <Suspense fallback={<WorkspaceChipSkeleton className="md:hidden" />}>
          <WorkspaceChip className="md:hidden" />
        </Suspense>
      </div>

      <AskDossierLink />

      <nav aria-label="Main">
        <Suspense
          fallback={
            <Suspense
              fallback={<NavList items={baseNavItems} pathname={null} />}
            >
              <NavLinks items={baseNavItems} />
            </Suspense>
          }
        >
          <SidebarNav />
        </Suspense>
      </nav>

      <Suspense fallback={null}>
        <RecentClients className="hidden md:block" />
      </Suspense>

      <Suspense
        fallback={<WorkspaceChipSkeleton className="mt-auto hidden md:flex" />}
      >
        <WorkspaceChip className="mt-auto hidden md:flex" />
      </Suspense>
    </aside>
  );
}

async function SidebarNav() {
  const [reports, connectors] = await Promise.all([
    getReportSummaries().catch(orEmpty),
    getConnectors().catch(orEmpty),
  ]);
  const toReview = reports.filter((report) => report.status === 'draft').length;
  const failing = connectors.filter((c) => c.status === 'failing').length;

  const items = baseNavItems.map((item): NavItem => {
    if (item.href === '/reports' && toReview > 0) {
      return { ...item, count: { value: toReview, label: 'to review' } };
    }
    if (item.href === '/connections' && failing > 0) {
      return {
        ...item,
        failure: `${failing} ${failing === 1 ? 'connection' : 'connections'} failing`,
      };
    }
    return item;
  });

  return (
    <Suspense fallback={<NavList items={items} pathname={null} />}>
      <NavLinks items={items} />
    </Suspense>
  );
}

async function RecentClients({ className }: { className?: string }) {
  const clients = await getRecentClients().catch(orNull);

  return (
    <section aria-labelledby="recent-clients-heading" className={className}>
      <h2
        id="recent-clients-heading"
        className="px-3 text-meta font-medium text-muted-on-ground"
      >
        Recent clients
      </h2>
      {clients === null ? (
        <p className="mt-2 px-3 text-meta text-muted-on-ground">
          Couldn’t load recent clients.
        </p>
      ) : clients.length === 0 ? (
        <p className="mt-2 px-3 text-meta text-muted-on-ground">
          Clients you open will appear here.
        </p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {clients.map((client) => (
            <li key={client.id}>
              <Link
                href={`/clients/${client.id}`}
                className="flex h-8 items-center rounded-full px-3 text-body text-text transition-colors hover:bg-sheet/60 hover:text-ink"
              >
                <span className="truncate">{client.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Who is signed in, to which workspace, and the way out. */
async function WorkspaceChip({ className }: { className?: string }) {
  const me = await getMe().catch(orNull);

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2.5 rounded-full bg-sheet/60 py-1.5 pr-1.5 pl-1.5',
        className,
      )}
    >
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-deep text-meta-sm font-semibold text-white"
      >
        {me?.workspace.name.charAt(0) ?? 'D'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-meta font-medium text-ink">
          {me?.workspace.name ?? 'Workspace'}
        </span>
        <span className="block truncate text-meta-sm text-muted-on-ground">
          {me?.user.name ?? 'Couldn’t load your account'}
        </span>
      </span>
      <form action={signOut} className="shrink-0">
        <button
          type="submit"
          aria-label="Sign out"
          title="Sign out"
          className="grid size-8 place-items-center rounded-full text-muted-on-ground transition-colors hover:bg-sheet hover:text-ink"
        >
          <LogOut aria-hidden className="size-4" strokeWidth={1.75} />
        </button>
      </form>
    </div>
  );
}

function WorkspaceChipSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('h-10 w-40 rounded-full bg-sheet/60', className)}
    />
  );
}
