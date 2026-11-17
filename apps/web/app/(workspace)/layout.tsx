import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';
import { CommandPalette } from '@/components/shell/command-palette';
import { SessionGate } from '@/components/shell/session-gate';
import { PaletteData, UnreadCount } from '@/components/shell/shell-data';
import { Sidebar } from '@/components/shell/sidebar';
import { SupportBanner } from '@/components/shell/support-banner';

/** Every signed-in page: the sidebar, and the page beside it. */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <CommandPalette>
      {/* Read per request; the rest of the shell prerenders. */}
      <Suspense fallback={null}>
        <SessionGate />
      </Suspense>
      <Suspense fallback={null}>
        <UnreadCount />
      </Suspense>
      <Suspense fallback={null}>
        <PaletteData />
      </Suspense>
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <SupportBanner />
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
          <main className="px-4 py-6 sm:px-8 lg:px-10 lg:py-7">{children}</main>
        </div>
      </div>
    </CommandPalette>
  );
}
