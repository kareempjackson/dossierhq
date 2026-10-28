import type {
  Client,
  RecordSource,
  Report,
  ReportLine,
  ReportSection,
  ReportSectionKind,
} from '@dossierhq/contracts';
import { devices, prefixes, seeded } from './devices.js';
import { clients } from './world.js';

type Week = {
  key: string;
  number: number;
  start: string;
  end: string;
  generatedAt: string;
  approvedAt: string | null;
};

export const weeks: Week[] = [
  {
    key: 'w38',
    number: 38,
    start: '2026-09-14',
    end: '2026-09-20',
    generatedAt: '2026-09-18T13:00:00.000Z',
    approvedAt: '2026-09-18T15:20:00.000Z',
  },
  {
    key: 'w39',
    number: 39,
    start: '2026-09-21',
    end: '2026-09-27',
    generatedAt: '2026-09-25T13:00:00.000Z',
    approvedAt: '2026-09-25T14:45:00.000Z',
  },
  {
    key: 'w40',
    number: 40,
    start: '2026-09-28',
    end: '2026-10-04',
    generatedAt: '2026-10-02T13:00:00.000Z',
    approvedAt: '2026-10-02T15:05:00.000Z',
  },
  {
    key: 'w41',
    number: 41,
    start: '2026-10-05',
    end: '2026-10-11',
    generatedAt: '2026-10-09T14:00:00.000Z',
    approvedAt: null,
  },
];

export const reportId = (clientId: string, week: Week) =>
  `${clientId}-2026-${week.key}`;

// Weekly records ------------------------------------------------------------

type Stats = {
  devices: number;
  patched: number;
  alerts: number;
  critical: number;
  tickets: number;
  backupNights: number;
};

/** This week's figures for the clients whose reports have exceptions. */
const thisWeek: Record<string, Partial<Stats>> = {
  'harbour-dental': { alerts: 7, critical: 3, tickets: 9, backupNights: 4 },
  'northside-legal': { alerts: 3, tickets: 14 },
  'cedar-street-clinic': { alerts: 5, tickets: 6 },
  'marlow-freight': { alerts: 9, critical: 1, tickets: 17 },
};

function statsFor(client: Client, week: Week): Stats {
  const random = seeded(`${client.id}-${week.key}`);
  const owned = devices.filter((device) => device.clientId === client.id);
  const current = owned.filter((d) => d.patchStatus === 'current').length;
  const isThisWeek = week.approvedAt === null;
  return {
    devices: owned.length,
    patched: isThisWeek ? current : owned.length - Math.floor(random() * 2),
    alerts: 1 + Math.floor(random() * 6),
    critical: 0,
    tickets: 3 + Math.floor(random() * 12),
    backupNights: 7,
    ...(isThisWeek ? thisWeek[client.id] : {}),
  };
}

const changeIdeas = [
  'Set up an account and laptop for a new starter',
  'Replaced a failing hard drive in a workstation',
  'Renewed the company’s domain name for another year',
  'Removed a leaver’s account and archived their mailbox',
  'Gave two staff access to the shared finance folder',
  'Moved a shared mailbox to the new team',
  'Changed the guest wi-fi password',
  'Added a second monitor at two desks',
];

export const reportSources: RecordSource[] = [];

function weeklySources(client: Client, week: Week, stats: Stats) {
  const prefix = prefixes[client.id] ?? 'XX';
  const base = `src-rpt-${client.id}-${week.key}`;
  // Friday of that week, 12:30 UTC.
  const at = new Date(
    new Date(`${week.start}T12:30:00.000Z`).getTime() + 4 * 86_400_000,
  ).toISOString();
  const period = `${week.start} to ${week.end}`;
  const change =
    changeIdeas[
      Math.floor(
        seeded(`${client.id}-${week.key}-change`)() * changeIdeas.length,
      )
    ] ?? changeIdeas[0]!;
  const pending = stats.devices - stats.patched;
  const ids = {
    patch: `${base}-patch`,
    alerts: `${base}-alerts`,
    tickets: `${base}-tickets`,
    backup: `${base}-backup`,
    changes: `${base}-changes`,
  };

  reportSources.push(
    {
      id: ids.patch,
      kind: 'record',
      clientId: client.id,
      tool: 'ninjaone',
      recordId: `RPT-PATCH-${prefix}-${week.number}`,
      recordType: 'Patch report',
      title: `Patch compliance, week ${week.number}`,
      recordedAt: at,
      url: `https://ninjaone.example/reports/patch/${prefix}-${week.number}`,
      fields: [
        { label: 'Period', value: period },
        { label: 'Devices', value: String(stats.devices) },
        { label: 'Fully patched', value: String(stats.patched) },
        { label: 'Pending restart', value: String(pending) },
        { label: 'Failed', value: '0' },
      ],
    },
    {
      id: ids.alerts,
      kind: 'record',
      clientId: client.id,
      tool: 'ninjaone',
      recordId: `RPT-ALERT-${prefix}-${week.number}`,
      recordType: 'Alert summary',
      title: `Alerts, week ${week.number}`,
      recordedAt: at,
      url: `https://ninjaone.example/reports/alerts/${prefix}-${week.number}`,
      fields: [
        { label: 'Period', value: period },
        { label: 'Alerts', value: String(stats.alerts) },
        { label: 'Critical', value: String(stats.critical) },
        {
          label: 'Resolved same day',
          value: String(stats.alerts - stats.critical),
        },
      ],
    },
    {
      id: ids.tickets,
      kind: 'record',
      clientId: client.id,
      tool: 'ninjaone',
      recordId: `RPT-TICKET-${prefix}-${week.number}`,
      recordType: 'Ticket summary',
      title: `Helpdesk tickets, week ${week.number}`,
      recordedAt: at,
      url: `https://ninjaone.example/reports/tickets/${prefix}-${week.number}`,
      fields: [
        { label: 'Period', value: period },
        { label: 'Opened', value: String(stats.tickets) },
        { label: 'Closed', value: String(stats.tickets) },
        { label: 'First response', value: '14 min on average' },
      ],
    },
    {
      id: ids.backup,
      kind: 'record',
      clientId: client.id,
      tool: 'ninjaone',
      recordId: `RPT-BACKUP-${prefix}-${week.number}`,
      recordType: 'Backup summary',
      title: `Backups, week ${week.number}`,
      recordedAt: at,
      url: `https://ninjaone.example/reports/backup/${prefix}-${week.number}`,
      fields: [
        { label: 'Period', value: period },
        { label: 'Nightly jobs', value: '7' },
        { label: 'Succeeded', value: String(stats.backupNights) },
        { label: 'Failed', value: String(7 - stats.backupNights) },
      ],
    },
    {
      id: ids.changes,
      kind: 'record',
      clientId: client.id,
      tool: 'hudu',
      recordId: `LOG-${prefix}-${week.number}`,
      recordType: 'Change log',
      title: change,
      recordedAt: at,
      url: `https://hudu.example/logs/${prefix}-${week.number}`,
      fields: [
        { label: 'Change', value: change },
        { label: 'By', value: 'Jordan Pike' },
        { label: 'Week', value: String(week.number) },
      ],
    },
  );
  return { ids, change };
}

// Report bodies -------------------------------------------------------------

const sectionTitles: Record<ReportSectionKind, string> = {
  'needs-attention': 'Needs attention',
  recommended: 'Recommended',
  summary: 'Summary',
  questions: 'Your questions',
  devices: 'Devices and patching',
  alerts: 'Alerts',
  tickets: 'Helpdesk',
  changes: 'Changes',
  'next-week': 'Next week',
};

let lineCount = 0;
const line = (text: string, ...sourceIds: string[]): ReportLine => ({
  id: `line-${++lineCount}`,
  text,
  sourceIds,
});

function sections(
  lines: Partial<Record<ReportSectionKind, ReportLine[]>>,
): ReportSection[] {
  return (Object.keys(sectionTitles) as ReportSectionKind[]).map((kind) => ({
    kind,
    title: sectionTitles[kind],
    lines: lines[kind] ?? [],
  }));
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

function glance(stats: Stats) {
  return [
    { label: 'Devices', value: String(stats.devices) },
    {
      label: 'Patched',
      value: `${Math.round((stats.patched / stats.devices) * 100)}%`,
      note: `${stats.patched} of ${stats.devices}`,
    },
    {
      label: 'Alerts',
      value: String(stats.alerts),
      note: stats.critical > 0 ? `${stats.critical} critical` : 'none urgent',
    },
    {
      label: 'Backups',
      value: `${stats.backupNights} of 7`,
      note: 'nights',
    },
  ];
}

type Ids = ReturnType<typeof weeklySources>['ids'];

function cleanBody(stats: Stats, ids: Ids, change: string) {
  const pending = stats.devices - stats.patched;
  return sections({
    summary: [
      line(
        `A quiet week: ${plural(stats.alerts, 'alert')}, none urgent, and ${plural(stats.tickets, 'helpdesk request')}, all closed.`,
        ids.alerts,
        ids.tickets,
      ),
    ],
    devices: [
      line(
        `${stats.patched} of ${stats.devices} devices are fully patched.${
          pending > 0
            ? ` ${pending === 1 ? 'One is' : `${pending} are`} waiting for a restart to finish.`
            : ''
        }`,
        ids.patch,
      ),
      line('Backups completed every night.', ids.backup),
    ],
    alerts: [
      line(
        `${plural(stats.alerts, 'alert')}, all low priority and resolved the same day.`,
        ids.alerts,
      ),
    ],
    changes: [line(`${change}.`, ids.changes)],
    'next-week': [
      line(
        'Routine patching on Wednesday evening, outside working hours.',
        ids.patch,
      ),
    ],
  });
}

/** This week's reports that need a person to read them first. */
const exceptionBodies: Record<
  string,
  { exceptions: string[]; body: (ids: Ids, stats: Stats) => ReportSection[] }
> = {
  'harbour-dental': {
    exceptions: [
      'Server backup failed three nights running',
      'One line has no source',
    ],
    body: (ids, stats) =>
      sections({
        'needs-attention': [
          line(
            'Backups of the imaging file server, HD-FS01, failed on the nights of 7, 8 and 9 October.',
            'src-hd-alert-48213',
            'src-hd-alert-48164',
            ids.backup,
          ),
          line(
            'Two reception PCs still run Windows 10, which no longer receives security updates.',
            'src-hd-device-rec01',
            'src-hd-device-rec02',
          ),
        ],
        recommended: [
          line(
            'Run a restore test of the imaging share this week, as Priya asked on 30 September.',
            'src-hd-call-restore-ask',
          ),
        ],
        summary: [
          line(
            `Apart from the backups, a steady week: ${stats.tickets} helpdesk requests, all closed.`,
            ids.alerts,
            ids.tickets,
          ),
          line(
            'Reception say the new appointment reminder texts are going down well with patients.',
          ),
        ],
        devices: [
          line(
            `${stats.patched} of ${stats.devices} devices are fully patched. HD-REC-01 and HD-REC-02 are waiting on the October update.`,
            ids.patch,
          ),
          line(
            'HD-LT-03 has not checked in since 1 October; it may be switched off or out of the building.',
            'src-hd-device-lt03',
          ),
        ],
        alerts: [
          line(
            `${stats.alerts} alerts: the 3 backup failures above, 2 disk space warnings that cleared on their own, and 2 printer offline alerts.`,
            ids.alerts,
          ),
        ],
        changes: [
          line(
            'Updated the reception printer driver on HD-REC-01 and HD-REC-02 on 6 October.',
            'src-hd-hudu-printer',
          ),
          line(
            'Sent quote Q-2291 for two replacement reception PCs on 6 October.',
            'src-hd-quote-q2291',
          ),
        ],
        'next-week': [
          line(
            'Book and run the imaging restore test, then send Priya the results.',
            'src-hd-call-restore-promise',
          ),
          line(
            'Follow up the reception PC quote with Priya.',
            'src-hd-quote-q2291',
          ),
        ],
      }),
  },
  'northside-legal': {
    exceptions: [
      'A commitment to the client is past its date',
      'Uses Hudu records that are 17 hours old',
    ],
    body: (ids, stats) =>
      sections({
        'needs-attention': [
          line(
            'We promised MFA on every remote account by 2 October. 29 of 38 accounts have it; the last 9 remote staff do not yet.',
            'src-nl-call-mfa-promise',
            'src-nl-hudu-mfa',
          ),
        ],
        recommended: [
          line(
            'Finish MFA for the remaining 9 remote staff by Friday 16 October.',
            'src-nl-hudu-mfa',
          ),
        ],
        summary: [
          line(
            `No outages this week, and ${stats.tickets} helpdesk requests, all closed.`,
            ids.tickets,
          ),
          line(
            'The conveyancing team moved onto its own SharePoint site on 7 October, as planned.',
            'src-nl-sp-site',
          ),
        ],
        devices: [
          line(`All ${stats.devices} devices are fully patched.`, ids.patch),
          line('Backups completed every night.', ids.backup),
        ],
        alerts: [
          line(
            `${stats.alerts} alerts, all low priority and resolved the same day.`,
            ids.alerts,
          ),
        ],
        changes: [
          line(
            'Moved 18,402 conveyancing files to the new SharePoint site.',
            'src-nl-sp-site',
          ),
        ],
        'next-week': [
          line(
            'Enrol the remaining 9 remote accounts in MFA, starting Monday.',
            'src-nl-hudu-mfa',
          ),
        ],
      }),
  },
  'cedar-street-clinic': {
    exceptions: ['One line has no source'],
    body: (ids, stats) =>
      sections({
        'needs-attention': [
          line(
            'The clinical system’s database disk on CSC-SQL01 is 94% full and will fill in about three weeks at its current rate.',
            'src-csc-alert-48190',
          ),
        ],
        recommended: [
          line(
            'Add 200 GB to the database disk during the next maintenance window.',
            'src-csc-alert-48190',
          ),
        ],
        summary: [
          line(
            `A stable week with no downtime in surgery hours and ${stats.tickets} helpdesk requests, all closed.`,
            ids.tickets,
            ids.alerts,
          ),
          line('Dr Okoro mentioned that patients like the new check-in kiosk.'),
        ],
        devices: [
          line(
            `${stats.patched} of ${stats.devices} devices are fully patched; CSC-RECEP-02 restarts tonight to finish.`,
            ids.patch,
          ),
          line('Backups completed every night.', ids.backup),
        ],
        alerts: [
          line(
            `${stats.alerts} alerts: the disk space warning above and 4 that cleared on their own.`,
            ids.alerts,
          ),
        ],
        changes: [
          line(
            'Renewed the patient portal’s security certificate on 5 October.',
            'src-csc-hudu-cert',
          ),
        ],
        'next-week': [
          line(
            'Extend the database disk once you approve the change.',
            'src-csc-alert-48190',
          ),
        ],
      }),
  },
  'marlow-freight': {
    exceptions: [
      'A critical alert is still open',
      'A recommendation is waiting for your decision',
    ],
    body: (ids, stats) =>
      sections({
        'needs-attention': [
          line(
            'On 9 October our security software stopped ransomware-like activity on a dispatch laptop, MF-LT-017. The laptop is isolated while we check it.',
            'src-mf-alert-48177',
          ),
        ],
        recommended: [
          line(
            'Scope the Eastleigh depot’s network and wi-fi so costs are with Gareth by 31 October.',
            'src-mf-call-depot',
            'src-mf-floorplan',
          ),
        ],
        summary: [
          line(
            `Apart from the laptop above, a normal week across ${stats.devices} devices, with ${stats.tickets} helpdesk requests, all closed.`,
            ids.alerts,
            ids.tickets,
          ),
        ],
        devices: [
          line(
            `${stats.patched} of ${stats.devices} devices are fully patched; two warehouse scanners need a firmware update.`,
            ids.patch,
          ),
          line('Backups completed every night.', ids.backup),
        ],
        alerts: [
          line(
            `${stats.alerts} alerts, including the critical one above. The rest were low priority.`,
            ids.alerts,
            'src-mf-alert-48177',
          ),
        ],
        changes: [
          line(
            'Set up accounts and laptops for three new starters in dispatch on 5 October.',
            'src-mf-hudu-starters',
          ),
        ],
        'next-week': [
          line(
            'Reimage MF-LT-017 and return it to dispatch once checks are clean.',
            'src-mf-alert-48177',
          ),
          line('Visit Eastleigh to survey the new depot.', 'src-mf-floorplan'),
        ],
      }),
  },
};

export const reports: Report[] = weeks.flatMap((week) =>
  clients.map((client): Report => {
    const stats = statsFor(client, week);
    const { ids, change } = weeklySources(client, week, stats);
    const special =
      week.approvedAt === null ? exceptionBodies[client.id] : undefined;
    return {
      id: reportId(client.id, week),
      clientId: client.id,
      weekStart: week.start,
      weekEnd: week.end,
      status: week.approvedAt ? 'approved' : 'draft',
      generatedAt: week.generatedAt,
      approvedAt: week.approvedAt,
      exceptions: special?.exceptions ?? [],
      title: `${client.name} weekly report`,
      glance: glance(stats),
      sections: special
        ? special.body(ids, stats)
        : cleanBody(stats, ids, change),
      sources: [],
    };
  }),
);

export const weekNumber = (weekStart: string) =>
  weeks.find((week) => week.start === weekStart)?.number ?? null;
