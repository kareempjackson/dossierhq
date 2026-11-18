import {
  reportSchema,
  type AttentionItem,
  type Client,
  type Device,
  type Recommendation,
  type Report,
  type Ticket,
  type TicketInsight,
} from '@dossierhq/contracts';
import { draftReport, weekOf, type DraftInput } from './drafter.js';

/** What a test entry doesn't say: no ID, address, side or recipients. */
const ENTRY = {
  id: null,
  email: null,
  side: null,
  via: null,
  to: [] as string[],
  cc: [] as string[],
};

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
  entries: [],
  entriesAsOf: null,
  entriesComplete: false,
  entriesVersion: 0,
  people: [],
  mergedInto: null,
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

/** The same records, written up for whoever looks after IT. */
const forTechnician = (changes: Partial<DraftInput> = {}) =>
  draftReport(input({ ...changes, audience: 'technician' }));

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
    expect(report.audience).toBe('executive');
    expect(report.glance.map((g) => [g.label, g.value])).toEqual([
      ['Devices', '2'],
      ['Up to date', '100%'],
      ['Alerts', '1'],
      ['Requests', '2'],
    ]);
    // For leadership: the brief, and none of the detail behind it.
    expect(report.sections.map((s) => [s.kind, s.title])).toEqual([
      ['brief', 'The week in brief'],
      ['from-you', 'What we need from you'],
      ['done', 'What we did'],
      ['watching', 'What we’re watching'],
      ['coming-up', 'Coming up'],
      ['questions', 'Your questions'],
    ]);
    expect(section(report, 'brief')).toEqual([
      'Nothing urgent this week: we resolved 2 requests and 1 is still open; all 2 devices are fully patched; 1 alert is active. We need one thing from you, listed below.',
    ]);
    // Only the client can move a request waiting on their reply.
    expect(section(report, 'from-you')).toEqual([
      '“Printer offline” for Ann Lee is waiting on your reply.',
    ]);
    expect(section(report, 'watching')).toEqual([]);
    expect(section(report, 'done')).toEqual([
      'Resolved “New starter laptop” for Tom Reid in 8 days.',
      'Resolved “Ticket 4” the same day.',
    ]);
    expect(section(report, 'coming-up')).toEqual([]);
    const lines = report.sections.flatMap((s) => s.lines);
    expect(lines.every((l) => l.sourceIds.length > 0)).toBe(true);
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
  });

  it('writes a request from Dossier’s executive read of it, when the read is current', () => {
    const read = (
      ticketId: string,
      headline: string | null,
      readAt = NOW,
    ): TicketInsight => ({
      ticketId,
      clientId: client.id,
      summary: 'What the team reads.',
      issue: 'Sign-in',
      category: 'accounts',
      symptoms: [],
      tried: [],
      rootCause: null,
      resolution: null,
      outcome: 'open',
      sentiment: 'calm',
      people: [],
      deviceIds: [],
      followUps: [],
      executive: headline ? { headline, points: [], decision: null } : null,
      withInternal: false,
      readAt,
      model: 'claude-haiku-5-5',
    });
    const report = draftReport(
      input({
        tickets: [
          ticket('1', {
            subject: 'FW: RE: No access to my account in Belgium!',
            requester: 'Kurt Gielen',
            status: 'Waiting on client',
            openedAt: '2026-10-27T09:00:00.000Z',
            updatedAt: '2026-10-27T15:00:00.000Z',
          }),
          ticket('2', {
            subject: 'Shared drive slow',
            urgency: 'high',
            openedAt: '2026-10-27T09:00:00.000Z',
          }),
          // Read before it last changed: its read may say something stale.
          ticket('3', { subject: 'Printer jams', updatedAt: NOW }),
          ticket('4', {
            open: false,
            subject: 'VPN drops',
            openedAt: '2026-10-26T09:00:00.000Z',
            updatedAt: '2026-10-27T09:00:00.000Z',
          }),
        ],
        insights: [
          read(
            'ticket-2',
            'Saving files to the shared drive is slow for everyone; we’re moving it to a faster server on Friday.',
          ),
          read(
            'ticket-3',
            'We’re looking into the jams',
            '2026-10-27T08:00:00.000Z',
          ),
          read('ticket-4', 'Staff working from home stay connected again'),
        ],
      }),
    );
    expect(section(report, 'done')).toEqual([
      'Staff working from home stay connected again.',
    ]);
    // The brief names the one waiting on the client, and counts the rest.
    expect(section(report, 'from-you')).toEqual([
      '“No access to my account in Belgium” for Kurt Gielen is waiting on your reply.',
    ]);
    expect(section(report, 'watching')).toEqual([
      'Saving files to the shared drive is slow for everyone; we’re moving it to a faster server on Friday (urgent, open since Tuesday 27 October).',
      '1 other request is still open.',
    ]);
  });

  it('asks the client only for what they can move, and watches the rest', () => {
    const rec = (
      id: string,
      executive: Recommendation['executive'],
      executiveStale = false,
    ): Recommendation => ({
      id,
      clientId: client.id,
      status: 'draft',
      title: `Technical ${id}`,
      reason: 'Why.',
      suggestedActions: [],
      risk: null,
      verification: null,
      executive,
      executiveStale,
      inReport: true,
      useful: null,
      createdAt: NOW,
      decidedAt: null,
      sourceIds: [`src-${id}`],
    });
    const report = draftReport(
      input({
        devices: [
          device('PC1', 'failed'),
          device('PC2', 'pending'),
          device('PC3', 'pending'),
          device('PC4', 'current'),
        ],
        tickets: [
          ticket('1', {
            subject: 'Server down',
            urgency: 'critical',
            openedAt: '2026-10-27T09:00:00.000Z',
          }),
          ticket('2', { subject: 'Mouse', status: 'Waiting on customer' }),
          ticket('3', { subject: 'Keyboard' }),
        ],
        recommendations: [
          rec('laptops', {
            headline: 'Two laptops are out of warranty',
            points: [],
            decision: 'Approve replacing them by 30 November',
          }),
          rec('disk', {
            headline: 'We’ll extend the file server’s disk this weekend',
            points: [],
            decision: null,
          }),
          // Written before the team reworded it: its own title instead.
          rec(
            'stale',
            { headline: 'Old wording', points: [], decision: 'Old ask' },
            true,
          ),
          // Accepted this week: in, whether or not it was put in the report.
          {
            ...rec('accepted', null),
            status: 'accepted',
            inReport: false,
            decidedAt: '2026-10-27T09:00:00.000Z',
          },
          // Accepted the week before: it went in that week's report.
          {
            ...rec('accepted-before', null),
            status: 'accepted',
            decidedAt: '2026-10-20T09:00:00.000Z',
          },
          // Left out of the report, or dismissed before there was a choice.
          { ...rec('left-out', null), inReport: false },
          { ...rec('dismissed', null), status: 'dismissed' },
        ],
      }),
    );
    expect(section(report, 'from-you')).toEqual([
      'Two laptops are out of warranty. Approve replacing them by 30 November.',
      '“Mouse” is waiting on your reply.',
    ]);
    expect(section(report, 'coming-up')).toEqual([
      'We’ll extend the file server’s disk this weekend.',
      'Technical stale.',
      'Technical accepted.',
    ]);
    expect(section(report, 'watching')).toEqual([
      '“Server down” (critical, open since Tuesday 27 October).',
      '1 other request is still open.',
      '3 devices still need updates: 1 failed to install them and 2 are waiting to finish.',
    ]);
    expect(section(report, 'brief')).toEqual([
      '1 thing needs attention: 3 requests are still open; 1 of 4 devices is fully patched; there are no active alerts. We need 2 things from you, listed below.',
    ]);
  });

  it('names a few urgent requests for leadership, and counts the rest', () => {
    const tickets = Array.from({ length: 9 }, (_, i) =>
      ticket(String(i + 1), { urgency: 'high' }),
    );
    const lines = section(draftReport(input({ tickets })), 'watching');
    expect(lines).toHaveLength(6 + 1);
    expect(lines.at(-1)).toBe('3 more urgent requests.');
  });

  it('lists up to twelve tickets for a technician, and counts the rest', () => {
    const tickets = Array.from({ length: 15 }, (_, i) => ticket(String(i + 1)));
    const report = forTechnician({
      tickets: tickets.map((t) => ({
        ...t,
        openedAt: '2026-10-01T09:00:00.000Z',
      })),
    });
    const lines = section(report, 'tickets');
    expect(lines[0]).toBe('No tickets opened or closed this week; 15 open.');
    expect(section(report, 'brief')).toEqual([
      '15 tickets open, none opened or closed this week.',
    ]);
    expect(lines).toHaveLength(1 + 12 + 1);
    expect(lines.at(-1)).toBe('3 more open tickets.');
  });

  it('says each thing once, without the tags and statuses typed onto subjects', () => {
    const report = draftReport(
      input({
        devices: [
          device('CPC-01', 'current', {
            type: 'laptop',
            assignedTo: 'DebbieSkinner',
            lastSeenAt: '2026-10-01T09:00:00.000Z',
          }),
        ],
        tickets: [
          ticket('1', {
            subject: 'FW: No access to my account in Belgium!',
            requester: 'Kurt Gielen',
            urgency: 'high',
            openedAt: '2026-10-27T09:00:00.000Z',
          }),
          ticket('2', {
            subject: 'RE: FW: No access to my account in Belgium!',
            requester: 'Kurt Gielen',
            urgency: 'high',
          }),
          ticket('3', {
            subject: 'BPI | BPI | monday invoice upload – In Progress',
            urgency: 'high',
          }),
          ticket('4', { subject: 'iPhone mail | Floor 2', urgency: 'high' }),
        ],
      }),
    );
    expect(section(report, 'watching')).toEqual([
      '“No access to my account in Belgium” for Kurt Gielen (2 requests, urgent, open since Tuesday 27 October).',
      '“Monday invoice upload” (urgent, open since Wednesday 28 October).',
      '“iPhone mail | Floor 2” (urgent, open since Wednesday 28 October).',
      '1 device hasn’t checked in for over two weeks.',
    ]);
    // The merged line cites both requests.
    expect(
      report.sections.find((s) => s.kind === 'watching')?.lines[0]?.sourceIds,
    ).toEqual(['src-ticket-1', 'src-ticket-2']);
  });

  it('names requests in plain words, never quoting what was written on them', () => {
    const entry = (
      at: string,
      kind: 'description' | 'comment',
      isPublic: boolean,
      text: string,
    ) => ({
      ...ENTRY,
      at,
      author: 'Jordan Pike',
      kind,
      public: isPublic,
      text,
    });
    const records = [
      ticket('1', {
        subject: 'Printer offline',
        requester: 'Ann Lee',
        openedAt: '2026-10-27T09:00:00.000Z',
        entries: [
          entry(
            '2026-10-27T09:00:00.000Z',
            'description',
            true,
            'The printer by reception shows offline and won’t print.',
          ),
          entry(
            '2026-10-27T11:00:00.000Z',
            'comment',
            false,
            'Ann unplugged it again.',
          ),
          entry(
            '2026-10-28T08:00:00.000Z',
            'comment',
            true,
            'We swapped its network cable; it prints again.',
          ),
          entry(
            '2026-10-28T09:00:00.000Z',
            'comment',
            false,
            'Check the switch port next week.',
          ),
        ],
      }),
      ticket('2', {
        subject: 'Outlook keeps asking for a password',
        // Says no more than the subject, and nothing public after it.
        entries: [
          entry(
            NOW,
            'description',
            true,
            'Outlook keeps asking for a password!',
          ),
          entry(NOW, 'comment', false, 'Reset the profile.'),
        ],
      }),
      ticket('3', {
        open: false,
        status: 'Resolved',
        subject: 'New starter laptop',
        openedAt: '2026-10-26T09:00:00.000Z',
        updatedAt: '2026-10-27T09:00:00.000Z',
        entries: [
          entry(
            '2026-10-26T09:00:00.000Z',
            'description',
            true,
            'Tom starts on Monday and needs a laptop.',
          ),
          entry(
            '2026-10-27T09:00:00.000Z',
            'comment',
            true,
            `Tom’s laptop is set up with Office and his email. ${'He signed in and everything works. '.repeat(10)}`,
          ),
        ],
      }),
      ticket('4', {
        open: false,
        subject: 'Shared mailbox',
        openedAt: '2026-10-26T09:00:00.000Z',
        updatedAt: '2026-10-26T15:00:00.000Z',
        entries: [
          entry(
            '2026-10-26T09:00:00.000Z',
            'description',
            true,
            'Accounts need a shared mailbox for invoices.',
          ),
        ],
      }),
    ];
    const report = draftReport(input({ tickets: records }));

    expect(section(report, 'watching')).toEqual(['2 requests are still open.']);
    expect(section(report, 'done')).toEqual([
      'Resolved “New starter laptop” in 1 day.',
      'Resolved “Shared mailbox” the same day.',
    ]);
    // What was written on the tickets, public or not, isn't the report's,
    // whoever it's written for.
    for (const written of [report, forTechnician({ tickets: records })]) {
      expect(JSON.stringify(written)).not.toMatch(
        /unplugged|switch port|Reset the profile|network cable|Tom’s laptop|invoices/,
      );
    }
  });

  it('names each device behind on updates for a technician, and cites counts to a snapshot in NinjaOne', () => {
    const report = forTechnician({
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
    });

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
        { label: 'Windows 10 Pro', value: '1' },
      ]),
    );
    const devices = report.sections.find((s) => s.kind === 'devices')!.lines;
    expect(devices.map((l) => [l.text, l.sourceIds])).toEqual([
      [
        '3 devices: 1 workstation, 1 laptop and 1 server.',
        ['acme-2026-10-26-devices'],
      ],
      [
        '1 of 3 devices fully patched, 1 failed, 1 waiting to finish.',
        ['acme-2026-10-26-devices'],
      ],
      [
        'Operating systems: Windows 10 Pro (1), Windows 11 Pro (1) and Windows Server 2022 (1).',
        ['acme-2026-10-26-devices'],
      ],
      [
        'PC1 (laptop, Windows 10 Pro, Ann Lee): updates failed to install.',
        ['src-PC1'],
      ],
      [
        'PC2 (workstation, Windows 11 Pro): updates waiting to finish installing.',
        ['src-PC2'],
      ],
    ]);
    expect(report.glance[1]).toEqual({
      label: 'Patched',
      value: '33%',
      note: '1 failed',
    });
    // Leadership hears how many, not which.
    const leaders = draftReport(input({ devices: [device('PC1', 'failed')] }));
    expect(section(leaders, 'watching')).toEqual([
      '1 device failed to install updates.',
    ]);
    expect(leaders.glance[1]).toEqual({
      label: 'Up to date',
      value: '0%',
      note: '0 of 1',
    });
  });

  it('cites the records themselves when there’s no link to check a count', () => {
    const report = forTechnician({
      devices: [device('PC1', 'failed'), device('PC2', 'current')],
    });
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

    expect(section(report, 'watching')).toEqual([
      'Backup failed on HD-FS01.',
      'SSL certificate expires on 3 November.',
      'Domain renews on 20 November.',
    ]);
    expect(section(report, 'coming-up')).toEqual([]);
    expect(section(report, 'brief')).toEqual([
      '2 things need attention: 1 alert is active, and it’s critical.',
    ]);
    expect(report.exceptions).toEqual([
      'Hudu has stopped syncing',
      'Backup failed on HD-FS01',
    ]);

    // A technician gets the alert under Alerts, and the rest to watch.
    const technical = forTechnician({
      attention: [
        item('backup', 'alert', 'critical', 'Backup failed on HD-FS01'),
        item('ssl', 'risk', 'high', 'SSL certificate expires on 3 November'),
        item('domain', 'risk', 'normal', 'Domain renews on 20 November'),
      ],
    });
    expect(section(technical, 'alerts')).toEqual([
      'Critical: Backup failed on HD-FS01 (since Wednesday 28 October).',
    ]);
    expect(section(technical, 'watching')).toEqual([
      'Urgent: SSL certificate expires on 3 November.',
      'Domain renews on 20 November.',
    ]);
    expect(section(technical, 'brief')).toEqual([
      '1 active alert (1 critical).',
    ]);
  });

  it('flags urgent items without critical ones, and an empty client', () => {
    expect(
      draftReport(input({ attention: [item('ssl', 'risk', 'high')] }))
        .exceptions,
    ).toEqual(['1 urgent item under What we’re watching']);
    const empty = draftReport(input());
    expect(empty.exceptions).toEqual([
      'Dossier has no records for Acme Accountants yet',
    ]);
    expect(empty.sections.every((s) => s.lines.length === 0)).toBe(true);
    expect(empty.glance[1]).toEqual({
      label: 'Up to date',
      value: '–',
      note: 'no devices',
    });
    expect(
      forTechnician({ attention: [item('ssl', 'risk', 'high')] }).exceptions,
    ).toEqual(['1 urgent item to check']);
  });

  it('lists up to twelve records, then sums up the rest', () => {
    const alerts = Array.from({ length: 15 }, (_, i) =>
      item(`a${i}`, 'alert', 'normal'),
    );
    const lines = forTechnician({ attention: alerts }).sections.find(
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
    const records = input({
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
    });
    const report = draftReport(records);

    expect(section(report, 'brief')).toEqual([
      '1 thing needs attention: the one device is fully patched; there are no active alerts.',
    ]);
    expect(section(report, 'done')).toEqual([
      'Met for “Monthly check-in” on Tuesday 27 October (30 minutes, with Priya Nair and Tom Reid).',
    ]);
    // A technician gets the device by name, and how long it's been quiet.
    expect(
      section(draftReport({ ...records, audience: 'technician' }), 'devices'),
    ).toEqual([
      'The one device is fully patched.',
      'Operating systems: Windows 11 Pro (1).',
      'LT-03 (laptop, Windows 11 Pro, Sam Holt): last checked in Thursday 1 October, 27 days ago.',
    ]);
    expect(section(report, 'watching')).toEqual([
      'Still open 8 weeks on: Send the quote.',
      '1 device hasn’t checked in for over two weeks.',
      'Raised in “Monthly check-in”: Worried about phishing.',
    ]);
    // The overdue action is listed once, under What we're watching.
    expect(section(report, 'coming-up')).toEqual([
      'Run a restore test of the imaging share (agreed 27 October, due 6 November).',
      'You asked in “Monthly check-in”: Check the backups.',
    ]);
  });

  it('writes a technician’s report with tickets by number and status', () => {
    const report = forTechnician({
      devices: [
        device('PC1', 'current'),
        device('PC2', 'failed', { assignedTo: 'BPI\\tom' }),
      ],
      tickets: [
        ticket('4821', {
          subject: 'FW: Printer offline',
          status: 'Waiting on client',
          requester: 'Ann Lee',
          openedAt: '2026-10-27T09:00:00.000Z',
          updatedAt: '2026-10-27T15:00:00.000Z',
        }),
        ticket('4822', { subject: 'Mouse' }),
        ticket('4823', {
          subject: 'Server down',
          status: 'In Progress',
          urgency: 'critical',
          assignedTo: 'Jordan Pike',
          openedAt: '2026-10-27T09:00:00.000Z',
        }),
        ticket('4810', {
          open: false,
          status: 'Resolved',
          subject: 'New starter laptop',
          requester: 'Tom Reid',
          openedAt: '2026-10-20T09:00:00.000Z',
        }),
      ],
      attention: [item('disk', 'alert', 'high', 'Disk almost full')],
    });

    expect(reportSchema.parse(report)).toEqual(report);
    expect(report.audience).toBe('technician');
    expect(report.sections.map((s) => [s.kind, s.title])).toEqual([
      ['brief', 'Summary'],
      ['from-you', 'Waiting on you'],
      ['alerts', 'Alerts'],
      ['devices', 'Devices and patching'],
      ['tickets', 'Open tickets'],
      ['done', 'Done this week'],
      ['watching', 'Watch list'],
      ['coming-up', 'Follow-ups'],
      ['questions', 'Your questions'],
    ]);
    expect(section(report, 'brief')).toEqual([
      '3 tickets open (1 urgent), 3 opened and 1 closed this week; 1 of 2 devices fully patched (1 failed); 1 active alert. One thing is waiting on you.',
    ]);
    expect(section(report, 'from-you')).toEqual([
      '#4821 “Printer offline” for Ann Lee: Waiting on client, last updated Tuesday 27 October.',
    ]);
    // Most urgent first; the one waiting on the client is listed above.
    expect(section(report, 'tickets')).toEqual([
      '3 tickets opened and 1 closed this week; 3 open, 1 of them waiting on you.',
      '#4823 “Server down”: In Progress, critical, open since Tuesday 27 October, with Jordan Pike.',
      '#4822 “Mouse”: Open, open since Wednesday 28 October.',
    ]);
    expect(section(report, 'done')).toEqual([
      '#4810 “New starter laptop” for Tom Reid: Resolved in 8 days.',
    ]);
    expect(section(report, 'alerts')).toEqual([
      'Urgent: Disk almost full (since Wednesday 28 October).',
    ]);
    expect(section(report, 'devices')).toContain(
      'PC2 (workstation, Windows 11 Pro, tom): updates failed to install.',
    );
    expect(report.glance.map((g) => [g.label, g.value, g.note])).toEqual([
      ['Devices', '2', undefined],
      ['Patched', '50%', '1 failed'],
      ['Alerts', '1', '1 urgent'],
      ['Open tickets', '3', '3 new, 1 closed'],
    ]);
    expect(report.exceptions).toEqual(['1 urgent item to check']);
    const lines = report.sections.flatMap((s) => s.lines);
    expect(lines.every((l) => l.sourceIds.length > 0)).toBe(true);
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
  });
});
