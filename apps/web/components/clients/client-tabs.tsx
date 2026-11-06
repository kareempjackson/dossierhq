'use client';

import { usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { FolderSheet, FolderTabs } from '@/components/ui/folder-tabs';

type Tab = { path: string; label: string; count?: number };

/**
 * A client file's tabs and the sheet under them; the current tab comes from
 * the URL, so moving between tabs keeps the frame in place.
 */
export function ClientTabs({
  base,
  counts,
  children,
}: {
  base: string;
  /** Each tab's count; one that couldn't be read is left off. */
  counts: {
    devices?: number;
    users?: number;
    files?: number;
    meetings?: number;
    tickets?: number;
  };
  children: ReactNode;
}) {
  const pathname = usePathname();

  // On narrow screens the tabs scroll sideways; keep the current one in view.
  useEffect(() => {
    document
      .querySelector('nav[aria-label="Client file"] [aria-current=page]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);
  const tabs: Tab[] = [
    { path: '', label: 'Overview' },
    { path: '/devices', label: 'Devices', count: counts.devices },
    { path: '/users', label: 'Users', count: counts.users },
    { path: '/files', label: 'Files', count: counts.files },
    { path: '/meetings', label: 'Meetings', count: counts.meetings },
    { path: '/reports', label: 'Reports' },
    { path: '/tickets', label: 'Tickets', count: counts.tickets },
  ];
  const current = (tab: Tab) =>
    tab.path === ''
      ? pathname === base
      : pathname.startsWith(`${base}${tab.path}`);

  return (
    <>
      <FolderTabs
        label="Client file"
        tabs={tabs.map((tab) => ({
          href: `${base}${tab.path}`,
          label: tab.label,
          count: tab.count,
          current: current(tab),
        }))}
      />
      <FolderSheet
        joinsFirstTab={pathname === base}
        className="relative flex flex-col p-4 sm:p-6 lg:min-h-[calc(100dvh-12rem)]"
      >
        {children}
      </FolderSheet>
    </>
  );
}
