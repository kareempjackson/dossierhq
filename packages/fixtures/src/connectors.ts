import type { AuditEntry, Connector } from '@dossierhq/contracts';
import { devices, seeded } from './devices.js';
import { clients, NOW } from './world.js';

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
// Every read Dossier made in the last two hours, newest first.

const minutesBefore = (minutes: number) =>
  new Date(new Date(NOW).getTime() - minutes * 60_000).toISOString();

function buildAuditLog(): AuditEntry[] {
  const random = seeded('audit');
  const entries: Omit<AuditEntry, 'id'>[] = [];

  // Scheduled syncs, every 15 minutes, offset per tool.
  for (let minutes = 0; minutes <= 120; minutes += 15) {
    entries.push(
      {
        at: minutesBefore(minutes + 6),
        tool: 'ninjaone',
        read: 'Open alerts',
        clientId: null,
        recordCount: 9 + Math.floor(random() * 6),
      },
      {
        at: minutesBefore(minutes + 11),
        tool: 'hudu',
        read: 'Companies and assets, refused (401)',
        clientId: null,
        recordCount: 0,
      },
      {
        at: minutesBefore(minutes + 3),
        tool: 'fathom',
        read: 'New recordings and transcripts',
        clientId: null,
        recordCount: 0,
      },
    );
    if (minutes % 30 === 0) {
      entries.push({
        at: minutesBefore(minutes + 14),
        tool: 'sharepoint',
        read: 'Changed files in Clients libraries',
        clientId: null,
        recordCount: Math.floor(random() * 7),
      });
    }
    if (minutes % 60 === 0) {
      entries.push({
        at: minutesBefore(minutes + 6),
        tool: 'ninjaone',
        read: 'Device inventory',
        clientId: null,
        recordCount: devices.length,
      });
    }
  }

  // Friday's report drafting read each client's week.
  for (const client of clients) {
    entries.push({
      at: '2026-10-09T13:58:00.000Z',
      tool: 'ninjaone',
      read: 'Week 41 patch, alert, ticket and backup reports',
      clientId: client.id,
      recordCount: 4,
    });
  }

  entries.push({
    at: '2026-10-09T14:52:00.000Z',
    tool: 'ninjaone',
    read: 'Alert ALERT-48177 and device MF-LT-017',
    clientId: 'marlow-freight',
    recordCount: 2,
  });

  return entries
    .toSorted((a, b) => b.at.localeCompare(a.at))
    .map((entry, index) => ({ id: `audit-${index + 1}`, ...entry }));
}

export const auditLog: AuditEntry[] = buildAuditLog();
