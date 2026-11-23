import { Suspense, type ReactNode } from 'react';
import { CommandPalette } from '@/components/shell/command-palette';
import { MobileHeader } from '@/components/shell/mobile-header';
import { SessionGate } from '@/components/shell/session-gate';
import { PullToRefresh } from '@/components/shell/pull-to-refresh';
import { ShellData } from '@/components/shell/shell-data';
import { Sidebar } from '@/components/shell/sidebar';
import { SupportBanner } from '@/components/shell/support-banner';
import { TabBar } from '@/components/shell/tab-bar';

/**
 * Every signed-in page: the sidebar, and the page beside it. Below the
 * sidebar's width it's a phone's app instead: a bar along the top and tabs
 * along the bottom, with the page scrolling between them.
 */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <CommandPalette>
      {/* Read per request; the rest of the shell prerenders. */}
      <Suspense fallback={null}>
        <SessionGate />
      </Suspense>
      <Suspense fallback={null}>
        <ShellData />
      </Suspense>
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <MobileHeader banner={<SupportBanner />} />
          {/* At the foot, room to scroll the last of the page above the tabs. */}
          <main className="px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+6rem)] sm:px-8 lg:px-10 lg:py-7">
            {children}
          </main>
        </div>
      </div>
      <TabBar />
      <PullToRefresh />
    </CommandPalette>
  );
}
