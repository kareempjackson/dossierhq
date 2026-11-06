import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';
import { CommandPalette } from '@/components/shell/command-palette';
import { SessionGate } from '@/components/shell/session-gate';
import { ShellProvider } from '@/components/shell/shell-context';
import { Sidebar } from '@/components/shell/sidebar';
import { getWorkspace } from '@/lib/workspace';

/** Every signed-in page: the sidebar, and the page beside it. */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const workspace = getWorkspace();
  const names = new Map(
    workspace.clients.map((client) => [client.id, client.name]),
  );
  return (
    <ShellProvider
      value={{
        unreadNotifications: workspace.notifications.filter(
          (item) => item.unread,
        ).length,
      }}
    >
      <CommandPalette
        clients={workspace.clients.map((client) => ({
          id: client.id,
          name: client.name,
          summary: client.summary,
          needsYou: client.tone !== 'calm',
        }))}
        reports={workspace.reports.map((report) => ({
          id: report.id,
          clientName: names.get(report.clientId) ?? report.clientId,
          week: report.week,
        }))}
      >
        {/* Who's signed in, read per request; the rest of the shell prerenders. */}
        <Suspense fallback={null}>
          <SessionGate />
        </Suspense>
        <div className="flex min-h-dvh">
          <Sidebar />
          <div className="min-w-0 flex-1">
            {/* Narrow screens get the logo only for now; the menu comes later. */}
            <div className="px-4 pt-5 sm:px-8 lg:hidden">
              <Link
                href="/"
                aria-label="Dossier, today"
                className="inline-block rounded-sm"
              >
                <Logo height={22} />
              </Link>
            </div>
            <main className="px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
              {children}
            </main>
          </div>
        </div>
      </CommandPalette>
    </ShellProvider>
  );
}
