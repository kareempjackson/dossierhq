import type {
  AttentionItem,
  Client,
  Device,
  Meeting,
  MeetingNote,
  Source,
  Ticket,
} from '@dossierhq/contracts';
import {
  endUserDetail,
  findEndUsers,
  personKey,
  spacedName,
  type EndUserRecords,
} from './end-users.js';

const client: Client = {
  id: 'acme',
  name: 'Acme',
  industry: null,
  location: null,
  seats: null,
  primaryContact: { name: 'Dr Helen Okoro', role: 'Partner' },
  contract: null,
  domains: [],
};

const device = (name: string, assignedTo: string | null): Device => ({
  id: `dev-${name}`,
  clientId: 'acme',
  name,
  type: 'laptop',
  os: 'Windows 11 Pro',
  assignedTo,
  lastSeenAt: '2026-10-01T09:00:00.000Z',
  patchStatus: 'current',
  sourceId: `src-${name}`,
});

const ticket = (
  number: string,
  requester: string | null,
  more: Partial<Ticket> = {},
): Ticket => ({
  id: `t-${number}`,
  clientId: 'acme',
  number,
  subject: `Ticket ${number}`,
  status: 'Open',
  open: true,
  urgency: 'normal',
  requester,
  assignedTo: 'Sam Tech',
  openedAt: '2026-10-02T09:00:00.000Z',
  updatedAt: '2026-10-02T09:00:00.000Z',
  sourceId: `src-t-${number}`,
  entries: [],
  entriesAsOf: null,
  entriesComplete: false,
  entriesVersion: 0,
  people: [],
  mergedInto: null,
  ...more,
});

const meeting = (
  id: string,
  occurredAt: string,
  attendees: Meeting['attendees'],
  more: Partial<Meeting> = {},
): Meeting => ({
  id,
  clientId: 'acme',
  title: `Meeting ${id}`,
  occurredAt,
  durationMinutes: 30,
  attendees,
  recordingSourceId: `src-${id}`,
  planning: [],
  concerns: [],
  askedFor: [],
  readAt: null,
  ...more,
});

const note = (id: string, occurredOn: string, attendees: string[]) =>
  ({
    id,
    clientId: 'acme',
    title: `Notes ${id}`,
    occurredOn,
    attendees,
    body: 'Notes',
    via: 'paste',
    addedBy: { userId: null, name: 'Sam Tech' },
    createdAt: `${occurredOn}T18:00:00.000Z`,
    planning: [],
    concerns: [],
    askedFor: [],
    readAt: null,
  }) satisfies MeetingNote;

const records = (more: Partial<EndUserRecords>): EndUserRecords => ({
  client: { ...client, primaryContact: null },
  devices: [],
  tickets: [],
  meetings: [],
  notes: [],
  staffEmails: [],
  ...more,
});

describe('end users', () => {
  it('reads one person from every way the tools spell them', () => {
    expect(personKey('RochelleKing')).toBe('rochelleking');
    expect(personKey(' Rochelle  King ')).toBe('rochelleking');
    expect(personKey('rochelle.king@acme.example')).toBe('rochelleking');
    expect(personKey('Dr. Helen Okoro')).toBe('helenokoro');
    expect(personKey('Priya Nair (practice manager)')).toBe('priyanair');
    expect(personKey('Zoë Brontë')).toBe('zoebronte');
    expect(personKey(' - ')).toBeNull();
  });

  it('spaces a run-together sign-in into a name', () => {
    expect(spacedName('KiaLewis')).toBe('Kia Lewis');
    expect(spacedName('Laura-MaeBritton')).toBe('Laura-Mae Britton');
    expect(spacedName('JohnMcDonald')).toBe('John McDonald');
    expect(spacedName('AnnaMacArthur')).toBe('Anna MacArthur');
    expect(spacedName('ann.lee')).toBe('Ann Lee');
    expect(spacedName('Ann_Lee')).toBe('Ann Lee');
    expect(spacedName('itsupport')).toBe('itsupport');
    expect(spacedName('Reception')).toBe('Reception');
    expect(spacedName('Rochelle  King')).toBe('Rochelle  King');
    expect(spacedName('it.support@acme.example')).toBe(
      'it.support@acme.example',
    );
  });

  it('names someone known only by a sign-in with a space', () => {
    const [user] = findEndUsers(
      records({ devices: [device('AC-LT-01', 'DebbieSkinner')] }),
    );

    expect(user!.user).toMatchObject({
      id: 'debbieskinner',
      name: 'Debbie Skinner',
      signIns: ['DebbieSkinner'],
    });
  });

  it('joins a sign-in, tickets and meetings into one person, named as fully as any tool has it', () => {
    const [user, ...rest] = findEndUsers(
      records({
        devices: [device('AC-LT-01', 'RochelleKing')],
        tickets: [
          ticket('1', 'Rochelle  King', { open: false }),
          ticket('2', 'rochelle.king@acme.example', {
            openedAt: '2026-10-05T09:00:00.000Z',
          }),
        ],
        meetings: [
          meeting('m1', '2026-09-20T14:00:00.000Z', [
            { name: 'Rochelle King', role: 'client' },
          ]),
        ],
      }),
    );

    expect(rest).toEqual([]);
    expect(user!.user).toEqual({
      id: 'rochelleking',
      clientId: 'acme',
      name: 'Rochelle King',
      role: null,
      primaryContact: false,
      email: 'rochelle.king@acme.example',
      signIns: ['RochelleKing'],
      deviceIds: ['dev-AC-LT-01'],
      tickets: 2,
      ticketsRaised: 2,
      openTickets: 1,
      meetings: 1,
      lastContactAt: '2026-10-05T09:00:00.000Z',
    });
    expect(user!.devices.map((d) => d.name)).toEqual(['AC-LT-01']);
  });

  it('leaves out the MSP’s own people, automated senders and built-in sign-ins', () => {
    const users = findEndUsers(
      records({
        devices: [
          device('AC-LT-01', 'Administrator'),
          device('AC-LT-02', 'SamTech'),
          device('AC-WS-01', 'Reception'),
        ],
        tickets: [
          ticket('1', 'noreply@mailsender.example'),
          ticket('2', 'Do-Not-Reply@alerts.example'),
          ticket('3', 'Alex@MSP.example'),
          ticket('4', 'Jo Field'),
        ],
        meetings: [
          meeting('m1', '2026-09-20T14:00:00.000Z', [
            { name: 'Jo Field', role: 'client' },
            { name: 'Kim  Partner', role: 'msp' },
          ]),
        ],
        notes: [note('n1', '2026-09-21', ['Kim Partner', 'Jo Field'])],
        staffEmails: ['alex@msp.example'],
      }),
    );

    expect(users.map(({ user }) => user.name)).toEqual([
      'Jo Field',
      'Reception',
    ]);
  });

  it('keeps a client’s people who share a name with the MSP’s', () => {
    const users = findEndUsers(
      records({
        client: { ...client, primaryContact: { name: 'Sam Tech', role: '' } },
        tickets: [ticket('1', 'Sam Tech'), ticket('2', 'Alex Owner')],
        staffEmails: ['alex.owner@msp.example'],
      }),
    );

    // Sam Tech is assigned the tickets, but is also the primary contact.
    expect(
      users.map(({ user }) => [user.name, user.primaryContact, user.role]),
    ).toEqual([
      ['Alex Owner', false, null],
      ['Sam Tech', true, null],
    ]);
  });

  it('adds notes only to people found elsewhere', () => {
    const users = findEndUsers(
      records({
        tickets: [ticket('1', 'Jo Field')],
        notes: [note('n1', '2026-09-21', ['Jo Field', 'Priya'])],
      }),
    );

    expect(users.map(({ user }) => [user.name, user.meetings])).toEqual([
      ['Jo Field', 1],
    ]);
    expect(users[0]!.user.lastContactAt).toBe('2026-10-02T09:00:00.000Z');
  });

  it('marks the primary contact with their role, even under a title', () => {
    const [user] = findEndUsers(
      records({
        client,
        devices: [device('AC-LT-01', 'helen.okoro')],
      }),
    );

    expect(user!.user).toMatchObject({
      id: 'helenokoro',
      name: 'Dr Helen Okoro',
      role: 'Partner',
      primaryContact: true,
      signIns: ['helen.okoro'],
      deviceIds: ['dev-AC-LT-01'],
      lastContactAt: null,
    });
  });

  it('counts someone listed twice in a meeting once', () => {
    const [user] = findEndUsers(
      records({
        meetings: [
          meeting('m1', '2026-09-20T14:00:00.000Z', [
            { name: 'Jo Field', role: 'client' },
            { name: 'Jo Field', role: 'client' },
          ]),
        ],
      }),
    );

    expect(user!.user.meetings).toBe(1);
  });

  it('shows what they said, newest meeting first, and what needs attention on their things', () => {
    const quote = (id: string, speakerName: string): Source => ({
      id,
      kind: 'meeting',
      tool: 'fathom',
      clientId: 'acme',
      recordId: 'CALL-1',
      recordType: 'Recording',
      title: 'Meeting m1',
      recordedAt: '2026-09-20T14:00:00.000Z',
      url: 'https://fathom.example/calls/1',
      fields: [],
      meetingId: 'm1',
      transcriptAt: '00:01:00',
      speakerRole: 'client',
      speakerName,
      quote: 'Words',
    });
    const item = (id: string, sourceIds: string[]): AttentionItem => ({
      id,
      clientId: 'acme',
      kind: 'alert',
      urgency: 'high',
      title: id,
      raisedAt: '2026-10-01T09:00:00.000Z',
      sourceIds,
    });
    const found = findEndUsers(
      records({
        devices: [device('AC-LT-01', 'JoField'), device('AC-LT-02', 'Ben')],
        tickets: [ticket('7', 'Jo Field')],
        meetings: [
          meeting(
            'm1',
            '2026-09-20T14:00:00.000Z',
            [
              { name: 'Jo Field', role: 'client' },
              { name: 'Ben Other', role: 'client' },
            ],
            {
              planning: [{ text: 'Moving office', sourceIds: ['q-jo'] }],
              concerns: [{ text: 'Backups', sourceIds: ['q-ben'] }],
              askedFor: [{ text: 'A quote', sourceIds: ['q-ben', 'q-jo'] }],
            },
          ),
        ],
        notes: [note('n1', '2026-09-21', ['jo field'])],
      }),
    ).find(({ user }) => user.id === 'jofield');

    const detail = endUserDetail(
      found!,
      [quote('q-jo', 'Jo  Field'), quote('q-ben', 'Ben Other')],
      [
        item('device', ['src-alert', 'src-AC-LT-01']),
        item('ticket', ['src-t-7']),
        item('someone else', ['src-AC-LT-02']),
      ],
    );

    expect(detail.meetings).toEqual([
      { kind: 'notes', id: 'n1', title: 'Notes n1', occurredOn: '2026-09-21' },
      {
        kind: 'meeting',
        id: 'm1',
        title: 'Meeting m1',
        occurredAt: '2026-09-20T14:00:00.000Z',
        said: {
          planning: [{ text: 'Moving office', sourceIds: ['q-jo'] }],
          concerns: [],
          askedFor: [{ text: 'A quote', sourceIds: ['q-ben', 'q-jo'] }],
          readAt: null,
        },
      },
    ]);
    expect(detail.attention.map((a) => a.id)).toEqual(['device', 'ticket']);
    expect(detail.devices.map((d) => d.name)).toEqual(['AC-LT-01']);
    expect(detail.tickets.map((t) => t.number)).toEqual(['7']);
  });

  describe('tickets read as conversations', () => {
    const on = (
      name: string,
      side: 'client' | 'msp' | 'outside',
      role: 'reporter' | 'involved',
      email: string | null = null,
    ) => ({ name, email, side, role, via: 'email' as const, internal: false });
    const read = (
      number: string,
      people: ReturnType<typeof on>[],
      more: Partial<Ticket> = {},
    ) =>
      ticket(
        number,
        people.find((p) => p.role === 'reporter')?.name ??
          'itsupport@acme.example',
        {
          assignedTo: null,
          people,
          ...more,
        },
      );

    it('files each ticket under who started it, and shares it with who else was on it', () => {
      const users = findEndUsers(
        records({
          tickets: [
            read('1', [
              on('Kurt Gielen', 'client', 'reporter', 'kurt@acme.example'),
              on('Giovanni Baptiste', 'msp', 'involved'),
              on('Ennie Kihedu', 'client', 'involved'),
              on('Matilda Ibeh', 'outside', 'involved'),
            ]),
            read(
              '2',
              [
                on('Ennie Kihedu', 'client', 'reporter'),
                on('Kurt Gielen', 'client', 'involved'),
              ],
              { open: false },
            ),
          ],
        }),
      );
      expect(
        users.map(({ user, tickets, involved }) => ({
          name: user.name,
          email: user.email,
          raised: tickets.map((t) => t.number),
          on: involved.map((t) => t.number),
          counts: [user.tickets, user.ticketsRaised, user.openTickets],
        })),
      ).toEqual([
        {
          name: 'Ennie Kihedu',
          email: null,
          raised: ['2'],
          on: ['1'],
          counts: [2, 1, 1],
        },
        {
          name: 'Kurt Gielen',
          email: 'kurt@acme.example',
          raised: ['1'],
          on: ['2'],
          counts: [2, 1, 1],
        },
      ]);
    });

    it('never makes a shared mailbox or a technician on a ticket a person', () => {
      const users = findEndUsers(
        records({
          tickets: [
            // Not read yet: only the tool's requester, a shared mailbox.
            ticket('1', 'itsupport@acme.example', { assignedTo: null }),
            read('2', [
              on('Kareem Jackson', 'msp', 'reporter'),
              on('Kia Lewis', 'client', 'involved'),
            ]),
          ],
          // A technician who also signs in to a client laptop is still theirs.
          devices: [device('AC-LT-09', 'KareemJackson')],
        }),
      );
      expect(users.map(({ user }) => user.name)).toEqual(['Kia Lewis']);
    });

    it('leaves out tickets merged into another', () => {
      const [kurt] = findEndUsers(
        records({
          tickets: [
            read('8488', [on('Kurt Gielen', 'client', 'reporter')]),
            read('8487', [on('Kurt Gielen', 'client', 'reporter')], {
              mergedInto: '8488',
            }),
          ],
        }),
      );
      expect(kurt!.tickets.map((t) => t.number)).toEqual(['8488']);
    });

    it('sends a person’s tickets without what’s written on them', () => {
      const [, kurt] = findEndUsers(
        records({
          tickets: [
            read('1', [on('Kurt Gielen', 'client', 'reporter')], {
              entries: [
                {
                  id: '1',
                  at: '2026-10-02T09:00:00.000Z',
                  author: 'Kurt Gielen',
                  email: null,
                  side: 'client',
                  via: null,
                  kind: 'description',
                  public: true,
                  to: [],
                  cc: [],
                  text: 'Help',
                },
              ],
            }),
            read('2', [
              on('Bo Chen', 'client', 'reporter'),
              on('Kurt Gielen', 'client', 'involved'),
            ]),
          ],
        }),
      );
      const detail = endUserDetail(kurt!, [], []);
      expect(detail.tickets).toEqual([
        expect.objectContaining({ number: '1', entries: [] }),
      ]);
      expect(detail.involvedTickets).toEqual([
        expect.objectContaining({ number: '2' }),
      ]);
    });
  });
});
