import type { Client } from '@dossierhq/contracts';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { ButtonLink } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/states';
import { Tabs } from '@/components/ui/tabs';
import {
  getClient,
  getDevices,
  getMeetings,
  getReportSummaries,
} from '@/lib/data';
import { AddMeetingNotes } from './add-meeting-notes';

export type ClientTab =
  'overview' | 'timeline' | 'meetings' | 'reports' | 'devices';

/** Reads the client for a /clients/[id] page, or shows the not-found page. */
export async function loadClient(params: Promise<{ id: string }>) {
  const client = await getClient((await params).id);
  if (!client) notFound();
  return client;
}

/** The client screen: breadcrumb, name, actions and tabs above each tab's content. */
export async function ClientSheet({
  client,
  tab,
  children,
}: {
  client: Client;
  tab: ClientTab;
  children: ReactNode;
}) {
  const [reports, meetings, devices] = await Promise.all([
    getReportSummaries({ clientId: client.id }).catch(() => []),
    getMeetings({ clientId: client.id }).catch(() => []),
    getDevices({ clientId: client.id }).catch(() => []),
  ]);
  const draft = reports.find((report) => report.status === 'draft');
  const base = `/clients/${client.id}`;

  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-10">
      <div className="mx-auto max-w-280">
        <Breadcrumb
          items={[
            { label: 'Clients', href: '/clients' },
            { label: client.name },
          ]}
        />
        <div className="mt-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
          <div className="min-w-0">
            <h1 className="text-title-compact sm:text-title">{client.name}</h1>
            <p className="mt-3 text-meta text-muted">
              {client.industry} · {client.location} · {client.seats} seats ·{' '}
              {client.contract.plan} · {client.primaryContact.name},{' '}
              {client.primaryContact.role.toLowerCase()}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AddMeetingNotes clientName={client.name} />
            {draft && (
              <ButtonLink variant="primary" href={`/reports/${draft.id}`}>
                Review this week’s report
              </ButtonLink>
            )}
          </div>
        </div>

        <Tabs
          label="Client sections"
          className="mt-8"
          current={tab === 'overview' ? base : `${base}/${tab}`}
          tabs={[
            { href: base, label: 'Overview' },
            { href: `${base}/timeline`, label: 'Timeline' },
            {
              href: `${base}/meetings`,
              label: 'Meetings',
              count: meetings.length,
            },
            {
              href: `${base}/reports`,
              label: 'Reports',
              count: reports.length,
            },
            {
              href: `${base}/devices`,
              label: 'Devices',
              count: devices.length,
            },
          ]}
        />

        <div className="mt-8">{children}</div>
      </div>
    </Sheet>
  );
}

export function ClientSheetSkeleton() {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-10">
      <div className="mx-auto max-w-280" aria-hidden>
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-5 h-9 w-72" />
        <Skeleton className="mt-4 h-3 w-96 max-w-full" />
        <Skeleton className="mt-10 h-px w-full" />
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Skeleton className="h-64 rounded-card" />
          <Skeleton className="h-64 rounded-card" />
        </div>
      </div>
      <span role="status" className="sr-only">
        Loading client
      </span>
    </Sheet>
  );
}
