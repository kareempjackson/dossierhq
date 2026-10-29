import {
  reportSchema,
  type AttentionItem,
  type Client,
  type Device,
  type Report,
  type Ticket,
} from '@dossierhq/contracts';
import { draftReport, weekOf, type DraftInput } from './drafter.js';

const NOW = '2026-10-28T10:00:00.000Z'; // A Wednesday.
const WEEK = { start: '2026-10-26', end: '2026-11-01' };

const client: Client = {
  id: 'acme',
  name: 'Acme Accountants',
  industry: null,
  location: null,
  seats: null,
  primaryContact: null,
  contract: null,
  domains: [],
};

const device = (
  name: string,
  patchStatus: Device['patchStatus'],
  changes: Partial<Device> = {},
): Device => ({
  id: `device-${name}`,
  clientId: client.id,
  name,
  type: 'workstation',
  os: 'Windows 11 Pro',
  assignedTo: null,
  lastSeenAt: NOW,
  patchStatus,
  sourceId: `src-${name}`,
  ...changes,
});

const ticket = (number: string, changes: Partial<Ticket> = {}): Ticket => ({
  id: `ticket-${number}`,
  clientId: client.id,
  number,
  subject: `Ticket ${number}`,
  status: 'Open',
  open: true,
  urgency: 'normal',
  requester: null,
  assignedTo: null,
  openedAt: NOW,
  updatedAt: NOW,
  sourceId: `src-ticket-${number}`,
  ...changes,
});

const item = (
  key: string,
  kind: AttentionItem['kind'],
  urgency: AttentionItem['urgency'],
  title = `Item ${key}`,
): AttentionItem => ({
  id: `attention-${key}`,
  clientId: client.id,
  kind,
  urgency,
  title,
  raisedAt: NOW,
  sourceIds: [`src-${key}`],
});

const input = (changes: Partial<DraftInput> = {}): DraftInput => ({
  id: 'acme-2026-10-26',
  client,
  week: WEEK,
  now: NOW,
  timeZone: 'Europe/London',
  devices: [],
  tickets: [],
  attention: [],
  workspaceAttention: [],
  commitments: [],
  meetings: [],
  recommendations: [],
  links: [],
  ...changes,
});

const section = (report: Report, kind: string) =>
  report.sections.find((s) => s.kind === kind)!.lines.map((l) => l.text);

describe('weekOf', () => {
  it('runs Monday to Sunday in the workspace’s time zone', () => {
    expect(weekOf(NOW, 'Europe/London')).toEqual(WEEK);
    expect(weekOf('2026-11-01T23:30:00.000Z', 'Europe/London')).toEqual(WEEK);
    // Already Monday in Auckland, still Sunday in London.
    expect(weekOf('2026-11-01T12:00:00.000Z', 'Pacific/Auckland')).toEqual({
      start: '2026-11-02',
      end: '2026-11-08',
    });
    expect(weekOf('2026-10-26T03:00:00.000Z', 'America/New_York')).toEqual({
      start: '2026-10-19',
      end: '2026-10-25',
    });
  });
});

describe('draftReport', () => {
  it('drafts a valid, clean report with every line cited', () => {
    const report = draftReport(
      input({
        devices: [device('PC1', 'current'), device('PC2', 'current')],
        tickets: [
          ticket('1', {
            subject: 'Printer offline',
            status: 'Waiting on client',
            urgency: 'high',
            requester: 'Ann Lee',
            assignedTo: 'Jordan Pike',
            openedAt: '2026-10-27T09:00:00.000Z',
          }),
          ticket('2', {
            open: false,
            status: 'Closed',
            subject: 'New starter laptop',
            requester: 'Tom Reid',
            openedAt: '2026-10-20T09:00:00.000Z',
          }),
          ticket('3', {
            open: false,
            openedAt: '2026-10-01T09:00:00.000Z',
            updatedAt: '2026-10-02T09:00:00.000Z',
          }),
          ticket('4', {
            open: false,
            openedAt: '2026-10-26T09:00:00.000Z',
            updatedAt: '2026-10-26T15:00:00.000Z',
          }),
        ],
        attention: [
          {
            ...item('disk', 'alert', 'normal', 'Disk almost full'),
            sourceIds: ['src-disk', 'src-PC1'],
          },
        ],
      }),
    );

    expect(reportSchema.parse(report)).toEqual(report);
    expect(report).toMatchObject({
      status: 'draft',
      weekStart: WEEK.start,
      weekEnd: WEEK.end,
      generatedAt: NOW,
      approvedAt: null,
      exceptions: [],
      title: 'Acme Accountants weekly report',
    });
    expect(report.glance.map((g) => [g.label, g.value])).toEqual([
      ['Devices', '2'],
      ['Patched', '100%'],
      ['Alerts', '1'],
      ['Tickets', '2'],
    ]);
    expect(section(report, 'summary')).toEqual([
      'A quiet week: 1 active alert, none urgent; 2 new helpdesk requests, 2 closed.',
    ]);
    expect(section(report, 'devices')).toEqual([
      'All 2 devices are fully patched.',
    ]);
    expect(section(report, 'alerts')).toEqual([
      'Disk almost full (PC1, since Wednesday 28 October).',
    ]);
    expect(section(report, 'tickets')).toEqual([
      '2 new requests this week; 2 closed and 1 still open.',
      '“Printer offline” (ticket 1): Waiting on client, raised by Ann Lee on Tuesday 27 October, high priority, with Jordan Pike.',
    ]);
    expect(section(report, 'changes')).toEqual([
      'Resolved “New starter laptop” (ticket 2) for Tom Reid in 8 days.',
      'Resolved “Ticket 4” (ticket 4) the same day.',
    ]);
    expect(section(report, 'next-week')).toEqual([]);
    const lines = report.sections.flatMap((s) => s.lines);
    expect(lines.every((l) => l.sourceIds.length > 0)).toBe(true);
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
  });

  it('names each device behind on updates, and cites counts to a snapshot in NinjaOne', () => {
    const report = draftReport(
      input({
        devices: [
          device('PC2', 'pending'),
          device('FS01', 'current', {
            type: 'server',
            os: 'Windows Server 2022',
          }),
          device('PC1', 'failed', {
            type: 'laptop',
            assignedTo: 'Ann Lee',
            os: 'Windows 10 Pro',
          }),
        ],
        tickets: [ticket('1')],
        links: [
          {
            tool: 'ninjaone',
            externalId: '7',
            clientId: client.id,
            name: client.name,
            url: 'https://eu.ninjarmm.com/#/customerDashboard/7/overview',
          },
        ],
      }),
    );

    expect(report.sources.map((s) => [s.id, s.recordType, s.url])).toEqual([
      [
        'acme-2026-10-26-devices',
        'Count',
        'https://eu.ninjarmm.com/#/customerDashboard/7/overview',
      ],
      [
        'acme-2026-10-26-tickets',
        'Count',
        'https://eu.ninjarmm.com/#/customerDashboard/7/overview',
      ],
    ]);
    expect(report.sources[0]!.fields).toEqual(
      expect.arrayContaining([
        { label: 'Laptops', value: '1' },
        { label: 'Servers', value: '1' },
        { label: 'Failed', value: '1' },
      ]),
    );
    const devices = report.sections.find((s) => s.kind === 'devices')!.lines;
    expect(devices.map((l) => [l.text, l.sourceIds])).toEqual([
      [
        '3 devices: 1 workstation, 1 laptop and 1 server.',
        ['acme-2026-10-26-devices'],
      ],
      ['1 of 3 devices is fully patched.', ['acme-2026-10-26-devices']],
      ['PC1 (Ann Lee, Windows 10 Pro) failed to install updates.', ['src-PC1']],
      [
        'PC2 (Windows 11 Pro) is waiting to finish installing updates.',
        ['src-PC2'],
      ],
    ]);
    expect(report.glance[1]).toEqual({
      label: 'Patched',
      value: '33%',
      note: '1 of 3',
    });
  });

  it('cites the records themselves when there’s no link to check a count', () => {
    const report = draftReport(
      input({ devices: [device('PC1', 'failed'), device('PC2', 'current')] }),
    );
    expect(report.sources).toEqual([]);
    expect(
      report.sections.find((s) => s.kind === 'devices')!.lines[0]!.sourceIds,
    ).toEqual(['src-PC1', 'src-PC2']);
  });

  it('puts urgent items first and says why the report needs a read', () => {
    const report = draftReport(
      input({
        attention: [
          item('backup', 'alert', 'critical', 'Backup failed on HD-FS01'),
          item('ssl', 'risk', 'high', 'SSL certificate expires on 3 November'),
          item('domain', 'risk', 'normal', 'Domain renews on 20 November'),
        ],
        workspaceAttention: [
          {
            ...item('hudu', 'connection', 'high'),
            clientId: null,
            title: 'Hudu has stopped syncing',
          },
          {
            ...item('tickets', 'connection', 'normal'),
            clientId: null,
            title: 'NinjaOne isn’t sharing tickets with Dossier',
          },
        ],
      }),
    );

    expect(section(report, 'needs-attention')).toEqual([
      'Backup failed on HD-FS01.',
      'SSL certificate expires on 3 November.',
      'Domain renews on 20 November.',
    ]);
    expect(section(report, 'alerts')).toEqual([
      'Critical: Backup failed on HD-FS01 (since Wednesday 28 October).',
    ]);
    expect(section(report, 'next-week')).toEqual([]);
    expect(section(report, 'summary')).toEqual([
      '1 active alert, and it’s critical.',
    ]);
    expect(report.exceptions).toEqual([
      'Hudu has stopped syncing',
      'Backup failed on HD-FS01',
    ]);
  });

  it('flags urgent items without critical ones, and an empty client', () => {
    expect(
      draftReport(input({ attention: [item('ssl', 'risk', 'high')] }))
        .exceptions,
    ).toEqual(['1 urgent item under Needs attention']);
    const empty = draftReport(input());
    expect(empty.exceptions).toEqual([
      'Dossier has no records for Acme Accountants yet',
    ]);
    expect(empty.sections.every((s) => s.lines.length === 0)).toBe(true);
    expect(empty.glance[1]).toEqual({
      label: 'Patched',
      value: '–',
      note: 'no devices',
    });
  });

  it('lists up to twelve records, then sums up the rest', () => {
    const alerts = Array.from({ length: 15 }, (_, i) =>
      item(`a${i}`, 'alert', 'normal'),
    );
    const lines = draftReport(input({ attention: alerts })).sections.find(
      (s) => s.kind === 'alerts',
    )!.lines;
    expect(lines).toHaveLength(13);
    expect(lines[12]).toEqual({
      id: expect.any(String),
      text: '3 more alerts.',
      sourceIds: ['src-a12', 'src-a13', 'src-a14'],
    });
  });

  it('writes up meetings, what came up in them, open actions and devices gone quiet', () => {
    const meeting = {
      clientId: client.id,
      durationMinutes: 30,
      attendees: [],
      planning: [],
      concerns: [],
      askedFor: [],
      readAt: null,
    };
    const report = draftReport(
      input({
        attention: [
          {
            ...item('overdue', 'commitment', 'high'),
            title: 'Still open 8 weeks on: Send the quote',
          },
        ],
        devices: [
          device('LT-03', 'current', {
            type: 'laptop',
            assignedTo: 'Sam Holt',
            lastSeenAt: '2026-10-01T08:00:00.000Z',
          }),
        ],
        meetings: [
          {
            ...meeting,
            id: 'meeting-1',
            title: 'Monthly check-in',
            occurredAt: '2026-10-27T14:00:00.000Z',
            attendees: [
              { name: 'Priya Nair', role: 'client' },
              { name: 'Jordan Pike', role: 'msp' },
              { name: 'Tom Reid', role: 'client' },
            ],
            concerns: [
              { text: 'Worried about phishing', sourceIds: ['src-worry'] },
            ],
            askedFor: [{ text: 'Check the backups', sourceIds: ['src-ask'] }],
            recordingSourceId: 'src-recording',
          },
          {
            ...meeting,
            id: 'meeting-0',
            title: 'Last month',
            occurredAt: '2026-09-27T14:00:00.000Z',
            askedFor: [{ text: 'Old ask', sourceIds: ['src-old-ask'] }],
            recordingSourceId: 'src-old-recording',
          },
        ],
        commitments: [
          {
            id: 'commitment-1',
            clientId: client.id,
            statement: 'Run a restore test of the imaging share',
            madeAt: '2026-10-27T14:00:00.000Z',
            dueOn: '2026-11-06',
            status: 'open',
            completedAt: null,
            sourceIds: ['src-promise'],
          },
          {
            id: 'commitment-2',
            clientId: client.id,
            statement: 'Send the quote',
            madeAt: '2026-09-01T14:00:00.000Z',
            dueOn: null,
            status: 'open',
            completedAt: null,
            sourceIds: ['src-overdue'],
          },
          {
            id: 'commitment-0',
            clientId: client.id,
            statement: 'Already done',
            madeAt: '2026-10-01T14:00:00.000Z',
            dueOn: null,
            status: 'done',
            completedAt: null,
            sourceIds: ['src-done'],
          },
        ],
      }),
    );

    expect(section(report, 'summary')).toEqual([
      'No active alerts.',
      'Met for “Monthly check-in” on Tuesday 27 October (30 minutes, with Priya Nair and Tom Reid).',
      'From “Monthly check-in”: Worried about phishing.',
    ]);
    expect(section(report, 'devices')).toEqual([
      'The one device is fully patched.',
      'LT-03 (Sam Holt, Windows 11 Pro) hasn’t checked in since Thursday 1 October; it may be switched off or out of the office.',
    ]);
    expect(section(report, 'needs-attention')).toEqual([
      'Still open 8 weeks on: Send the quote.',
    ]);
    // The overdue action is listed once, under Needs attention.
    expect(section(report, 'next-week')).toEqual([
      'Run a restore test of the imaging share (agreed 27 October, due 6 November).',
      'Asked for in “Monthly check-in”: Check the backups.',
    ]);
  });
});
