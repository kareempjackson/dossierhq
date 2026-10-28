import type { AuditEntry, Connector } from '@dossierhq/contracts';
import { devices, seeded } from './devices.js';
import { clients, NOW, users } from './world.js';

export const connectors: Connector[] = [
  {
    id: 'ninjaone',
    tool: 'ninjaone',
    account: 'eu.ninjarmm.com',
    scope: `RMM · ${clients.length} clients · ${devices.length} devices`,
    access: 'read: devices, alerts, patch status, activities',
    status: 'healthy',
    lastSyncAt: '2026-10-09T15:34:00.000Z',
    failure: null,
  },
  {
    id: 'hudu',
    tool: 'hudu',
    account: 'larkspur.huducloud.com',
    scope: 'Documentation · 14 companies · 1,284 assets',
    access: 'read: companies, assets, articles',
    status: 'failing',
    lastSyncAt: '2026-10-08T22:14:00.000Z',
    failure: {
      since: '2026-10-08T22:29:00.000Z',
      summary:
        'Hudu stopped accepting the API key Dossier uses at 23:29 on 8 Oct. Nothing from Hudu has synced since, so reports may show documentation that is out of date.',
      fix: 'Reconnect Hudu',
    },
  },
  {
    id: 'sharepoint',
    tool: 'sharepoint',
    account: 'larkspurit.sharepoint.com/sites/Clients',
    scope: 'Client files · 14 sites',
    access: 'read: files in each site’s Clients library',
    status: 'healthy',
    lastSyncAt: '2026-10-09T15:26:00.000Z',
    failure: null,
  },
  {
    id: 'fathom',
    tool: 'fathom',
    account: 'API key ending …4f2a',
    scope: 'Meeting recordings · 3 recorders',
    access: 'read: recordings, transcripts, summaries',
    status: 'healthy',
    lastSyncAt: '2026-10-09T15:37:00.000Z',
    failure: null,
  },
];

// Audit log -----------------------------------------------------------------
// Every read Dossier made in the last two hours, newest first, with the
// sign-ins and changes people made in that time.

const minutesBefore = (minutes: number) =>
  new Date(new Date(NOW).getTime() - minutes * 60_000).toISOString();

type Read = Pick<
  AuditEntry,
  'at' | 'tool' | 'what' | 'clientId' | 'recordCount'
> &
  Partial<Pick<AuditEntry, 'outcome'>>;

const read = ({ outcome = 'ok', ...entry }: Read): Omit<AuditEntry, 'id'> => ({
  kind: 'read',
  outcome,
  actor: null,
  ...entry,
});

const asActor = (user: (typeof users)[number]) => ({
  userId: user.id,
  name: user.name,
  email: user.email,
});
const [sam, priya] = users as [(typeof users)[number], (typeof users)[number]];

function buildAuditLog(): AuditEntry[] {
  const random = seeded('audit');
  const entries: Omit<AuditEntry, 'id'>[] = [];

  // Scheduled syncs, every 15 minutes, offset per tool.
  for (let minutes = 0; minutes <= 120; minutes += 15) {
    entries.push(
      read({
        at: minutesBefore(minutes + 6),
        tool: 'ninjaone',
        what: 'Open alerts',
        clientId: null,
        recordCount: 9 + Math.floor(random() * 6),
      }),
      read({
        at: minutesBefore(minutes + 11),
        tool: 'hudu',
        what: 'Companies and assets: refused (401)',
        clientId: null,
        recordCount: 0,
        outcome: 'failed',
      }),
      read({
        at: minutesBefore(minutes + 3),
        tool: 'fathom',
        what: 'New recordings and transcripts',
        clientId: null,
        recordCount: 0,
      }),
    );
    if (minutes % 30 === 0) {
      entries.push(
        read({
          at: minutesBefore(minutes + 14),
          tool: 'sharepoint',
          what: 'Changed files in Clients libraries',
          clientId: null,
          recordCount: Math.floor(random() * 7),
        }),
      );
    }
    if (minutes % 60 === 0) {
      entries.push(
        read({
          at: minutesBefore(minutes + 6),
          tool: 'ninjaone',
          what: 'Device inventory',
          clientId: null,
          recordCount: devices.length,
        }),
      );
    }
  }

  // Friday's report drafting read each client's week.
  for (const client of clients) {
    entries.push(
      read({
        at: '2026-10-09T13:58:00.000Z',
        tool: 'ninjaone',
        what: 'Week 41 patch, alert, ticket and backup reports',
        clientId: client.id,
        recordCount: 4,
      }),
    );
  }

  entries.push(
    read({
      at: '2026-10-09T14:52:00.000Z',
      tool: 'ninjaone',
      what: 'Alert ALERT-48177 and device MF-LT-017',
      clientId: 'marlow-freight',
      recordCount: 2,
    }),
  );

  // People: a mistyped password, then sign-ins and a change.
  const person = (
    at: string,
    kind: 'sign-in' | 'change',
    what: string,
    actor: (typeof users)[number],
    extra: Partial<AuditEntry> = {},
  ): Omit<AuditEntry, 'id'> => ({
    at,
    kind,
    tool: null,
    what,
    clientId: null,
    recordCount: 0,
    outcome: 'ok',
    actor: asActor(actor),
    ...extra,
  });
  entries.push(
    person(
      '2026-10-09T13:41:00.000Z',
      'sign-in',
      'Sign-in failed: wrong password',
      sam,
      {
        outcome: 'failed',
      },
    ),
    person('2026-10-09T13:42:00.000Z', 'sign-in', 'Signed in', sam),
    person(
      '2026-10-09T13:50:00.000Z',
      'change',
      'Changed the Hudu connection',
      sam,
      {
        tool: 'hudu',
      },
    ),
    person('2026-10-09T14:05:00.000Z', 'sign-in', 'Signed in', priya),
  );

  return entries
    .toSorted((a, b) => b.at.localeCompare(a.at))
    .map((entry, index) => ({ id: `audit-${index + 1}`, ...entry }));
}

export const auditLog: AuditEntry[] = buildAuditLog();
