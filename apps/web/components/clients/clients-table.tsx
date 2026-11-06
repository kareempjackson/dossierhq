'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button, ButtonLink } from '@/components/ui/button';
import { FolderSheet, FolderTabs } from '@/components/ui/folder-tabs';
import { Tag, type TagTone } from '@/components/ui/tag';
import { RENEWAL_SOON_DAYS, renewsIn } from '@/lib/client-paths';
import type { ClientRow, ClientStatus, FolderTone } from '@/lib/client-views';
import { cn } from '@/lib/cn';

export type ClientsView = 'all' | 'attention' | 'renewals' | 'healthy';

const VIEWS: { value: ClientsView; label: string; status?: ClientStatus }[] = [
  { value: 'all', label: 'All' },
  { value: 'attention', label: 'Needs attention', status: 'attention' },
  { value: 'renewals', label: 'Renewals', status: 'renewal' },
  { value: 'healthy', label: 'Healthy', status: 'healthy' },
];

const STATUS: Record<ClientStatus, { tone: TagTone; label: string }> = {
  attention: { tone: 'attention', label: 'Attention' },
  renewal: { tone: 'act', label: 'Renewal soon' },
  healthy: { tone: 'healthy', label: 'Healthy' },
};

const FOLDER: Record<FolderTone, string> = {
  act: 'text-lime',
  drafted: 'text-lilac',
  calm: 'text-stone',
};

const hrefFor = (view: ClientsView) =>
  view === 'all' ? '/clients' : `/clients?view=${view}`;

const isView = (value: string | null): value is ClientsView =>
  VIEWS.some((option) => option.value === value);

/** The table, on the tab named in the URL (`?view=`). Put it in Suspense. */
export function ClientsTableFromUrl({ clients }: { clients: ClientRow[] }) {
  const view = useSearchParams().get('view');
  return <ClientsTable clients={clients} view={isView(view) ? view : 'all'} />;
}

/**
 * Every client file, by tab: all, needing attention, renewing soon or
 * healthy. The rows are all here already, so a tab switches on the click,
 * without asking the server. Export downloads what's showing as CSV.
 */
export function ClientsTable({
  clients,
  view,
}: {
  clients: ClientRow[];
  view: ClientsView;
}) {
  const status = VIEWS.find((option) => option.value === view)?.status;
  const shown = clients.filter((client) => !status || client.status === status);
  const count = (option: (typeof VIEWS)[number]) =>
    option.status
      ? clients.filter((client) => client.status === option.status).length
      : clients.length;

  return (
    <div className="rounded-3xl bg-grey-2 p-2.5 sm:p-3">
      <FolderTabs
        label="Client views"
        tabs={VIEWS.map((option) => ({
          href: hrefFor(option.value),
          label: option.label,
          count: count(option),
          current: option.value === view,
        }))}
        onNavigate={(href) => window.history.pushState(null, '', href)}
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={shown.length === 0}
            onClick={() => exportCsv(shown, view)}
          >
            Export
          </Button>
        }
      />

      <FolderSheet
        joinsFirstTab={view === 'all'}
        className="overflow-hidden px-3 py-4 sm:px-5 sm:py-5"
      >
        {shown.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-separate border-spacing-y-1 text-left text-small">
              <thead>
                <tr className="text-[0.6875rem] text-muted">
                  {[
                    'Client',
                    'Status',
                    'Next renewal',
                    'Devices',
                    'Last meeting',
                  ].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="px-4 pb-2 font-normal"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((client) => (
                  <tr
                    key={client.id}
                    className="group relative odd:[&>td]:bg-grey-1 [&>td]:transition-colors hover:[&>td]:bg-grey-2"
                  >
                    <td className="rounded-l-xl px-4 py-3.5">
                      <Link
                        href={`/clients/${encodeURIComponent(client.id)}`}
                        className="flex items-center gap-3 rounded-sm font-medium after:absolute after:inset-0"
                      >
                        <FolderIcon className={FOLDER[client.tone]} />
                        {client.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5">
                      <Tag tone={STATUS[client.status].tone}>
                        {client.status === 'attention'
                          ? `${STATUS.attention.label} · ${client.attention}`
                          : STATUS[client.status].label}
                      </Tag>
                    </td>
                    <td className="px-4 py-3.5 text-muted">
                      {client.renewal
                        ? `${client.renewal.what} · ${renewsIn(client.renewal.inDays)}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-muted tabular-nums">
                      {client.devices ?? '—'}
                    </td>
                    <td className="rounded-r-xl px-4 py-3.5 text-muted">
                      {client.lastMeeting ?? 'None yet'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl bg-grey-1 px-4 py-8 text-center text-small text-muted">
            {clients.length === 0 ? (
              <>
                <p>
                  No clients yet. Connect NinjaOne or Hudu and each organization
                  becomes a client file.
                </p>
                <ButtonLink
                  href="/connections"
                  variant="act"
                  size="sm"
                  className="mt-4"
                >
                  Connect a tool
                </ButtonLink>
              </>
            ) : (
              <p>{EMPTY[view]}</p>
            )}
          </div>
        )}
      </FolderSheet>
    </div>
  );
}

const EMPTY: Record<ClientsView, string> = {
  all: 'No clients yet.',
  attention: 'Nothing needs attention at any client.',
  renewals: `No contract renews in the next ${RENEWAL_SOON_DAYS} days.`,
  healthy: 'Every client has something to look at.',
};

/** A small folder, coloured by what the file needs. */
function FolderIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 18 14"
      className={cn('h-3.5 w-[1.125rem] shrink-0', className)}
    >
      <path
        fill="currentColor"
        d="M0 2.5A2.5 2.5 0 0 1 2.5 0h3.6a2 2 0 0 1 1.5.7L8.8 2h6.7A2.5 2.5 0 0 1 18 4.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 0 11.5z"
      />
    </svg>
  );
}

/**
 * A cell for a spreadsheet: quoted, and with anything a spreadsheet would
 * run as a formula (names come from the tools) kept as text.
 */
function cell(value: string | number) {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** Downloads the rows on show as a CSV file. */
function exportCsv(clients: ClientRow[], view: ClientsView) {
  const rows = [
    [
      'Client',
      'Status',
      'Needs attention',
      'Next renewal',
      'Renews in (days)',
      'Devices',
      'Last meeting',
    ],
    ...clients.map((client) => [
      client.name,
      STATUS[client.status].label,
      client.attention,
      client.renewal?.what ?? '',
      client.renewal?.inDays ?? '',
      client.devices ?? '',
      client.lastMeeting ?? '',
    ]),
  ];
  const csv = rows.map((row) => row.map(cell).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
  );
  link.download = `dossier-clients-${view}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}
