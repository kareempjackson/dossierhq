import type { Ticket } from '@dossierhq/contracts';
import { describe, expect, it } from 'vitest';
import {
  addresses,
  type DirectoryPerson,
  emailThread,
  headerTime,
  type RawLogEntry,
  readTicketLog,
  reconcileTickets,
  signedBy,
} from './ticket-thread.js';

// Shapes taken from a real NinjaOne account whose client forwards its
// `itsupport@` mailbox into NinjaOne; names and addresses are made up.

const directory = new Map<string, DirectoryPerson>([
  [
    'u-sam',
    { name: 'Sam Okafor', email: 'sam@northwind-it.test', type: 'TECHNICIAN' },
  ],
  [
    'u-jess',
    { name: 'Jess Patel', email: 'jess@northwind-it.test', type: 'TECHNICIAN' },
  ],
  [
    'u-kim',
    { name: 'Kim Reyes', email: 'kim@consult.test', type: 'TECHNICIAN' },
  ],
]);
const mspDomains = new Set(['northwind-it.test', 'consult.test']);
const SECONDS = (iso: string) => Date.parse(iso) / 1000;

const description = (
  body: string,
  at = '2026-10-26T16:40:00Z',
): RawLogEntry => ({
  id: 100,
  type: 'DESCRIPTION',
  appUserContactUid: 'u-mailbox',
  appUserContactType: 'CONTACT',
  publicEntry: true,
  system: false,
  createTime: SECONDS(at),
  body: body.replace(/\n/g, '\r\n'),
});

const read = (log: RawLogEntry[], requester = 'itsupport@acme.test') =>
  readTicketLog(log, {
    directory,
    mspDomains,
    ticket: {
      requester,
      assignedTo: null,
      updatedAt: '2026-10-27T00:00:00.000Z',
    },
  });

/** Outlook's forward of a thread: newest first, each under a rule. */
const OUTLOOK = `
________________________________
From: Kurt Gielen <Kurt@acme.test>
Sent: Monday, October 26, 2026 12:40:39 PM (UTC-04:00) Georgetown, La Paz, Manaus, San Juan
To: itsupport <itsupport@acme.test>; kim.reyes <kim.reyes@consult.test>
Cc: Ennie Kihedu <Ennie@acme.test>
Subject: Re: Travel for Kurt

Seems to work fine now.

________________________________
From: itsupport <itsupport@acme.test>
Sent: Monday, 26 October 2026 19:26:52
To: Kurt Gielen <Kurt@acme.test>; kim.reyes <kim.reyes@consult.test>
Cc: Ennie Kihedu <Ennie@acme.test>
Subject: Re: Travel for Kurt

Hi Kurt,

We've updated the setting that blocked your sign-in.

Kind regards,
Sam

IT Support
Service Desk & Technical Assistance
E
itsupport@acme.test<mailto:itsupport@acme.test>
W
www.acme.test<https://www.acme.test/>
[Acme Inc.]<https://www.acme.test/>
[LinkedIn]<https://www.linkedin.com/company/acme/>               [Instagram] <https://www.instagram.com/acme>

________________________________
From: Kim Reyes <kim.reyes@consult.test>
Sent: Monday, October 26, 2026 9:28 AM
To: itsupport <itsupport@acme.test>
Subject: Travel for Kurt

Hi Sam,

Please let Kurt and Ennie sign in while they travel.
Teams passcode: rs7Wx6X5
`;

describe('reading a ticket forwarded by a shared mailbox', () => {
  it('splits the thread into its messages, oldest first, the first its description', () => {
    const { entries } = read([description(OUTLOOK)]);
    expect(
      entries.map(({ kind, author, side, via, to, cc }) => ({
        kind,
        author,
        side,
        via,
        to,
        cc,
      })),
    ).toEqual([
      {
        kind: 'description',
        author: 'Kim Reyes',
        side: 'msp',
        via: 'itsupport@acme.test',
        to: ['itsupport'],
        cc: [],
      },
      {
        kind: 'email',
        author: 'Sam Okafor',
        side: 'msp',
        via: 'itsupport@acme.test',
        to: ['Kurt Gielen', 'Kim Reyes'],
        cc: ['Ennie Kihedu'],
      },
      {
        kind: 'email',
        author: 'Kurt Gielen',
        side: 'client',
        via: null,
        to: ['itsupport', 'Kim Reyes'],
        cc: ['Ennie Kihedu'],
      },
    ]);
    // Each message's own words: no headers, no signature block, no secrets.
    expect(entries.map((e) => e.text)).toEqual([
      'Hi Sam,\n\nPlease let Kurt and Ennie sign in while they travel.\nTeams passcode: [redacted]',
      "Hi Kurt,\n\nWe've updated the setting that blocked your sign-in.\n\nKind regards,\nSam",
      'Seems to work fine now.',
    ]);
    expect(entries.map((e) => e.id)).toEqual(['100:0', '100:1', '100:2']);
  });

  it('dates each message, moving a quoted header by whole hours into place', () => {
    // Forwarded the moment it arrived.
    const { entries } = read([description(OUTLOOK, '2026-10-26T16:41:00Z')]);
    expect(entries.map((e) => e.at)).toEqual([
      // 9:28 AM, read in the zone the newest header gives (UTC-4).
      '2026-10-26T13:28:00.000Z',
      // 19:26:52 as Kurt's phone wrote it abroad: after his reply in UTC-4,
      // so it moves back the 7 hours that puts it before.
      '2026-10-26T16:26:52.000Z',
      '2026-10-26T16:40:39.000Z',
    ]);
  });

  it('names who started it and everyone on it, but never the mailbox', () => {
    const { people } = read([description(OUTLOOK)]);
    expect(
      people.map(({ name, side, role, via }) => ({ name, side, role, via })),
    ).toEqual([
      { name: 'Kim Reyes', side: 'msp', role: 'reporter', via: 'email' },
      { name: 'Sam Okafor', side: 'msp', role: 'involved', via: 'email' },
      {
        name: 'Kurt Gielen',
        side: 'client',
        role: 'involved',
        via: 'recipient',
      },
      {
        name: 'Ennie Kihedu',
        side: 'client',
        role: 'involved',
        via: 'recipient',
      },
    ]);
  });

  it('starts with the first person when automated mail came first', () => {
    const { people } = read([
      description(`
________________________________
From: Ann Lee <ann@acme.test>
Sent: Tuesday, October 27, 2026 9:00 AM
To: itsupport <itsupport@acme.test>
Subject: FW: New vulnerabilities notification

Is this one for us?

________________________________
From: Microsoft Defender <defender-noreply@microsoft.com>
Sent: Tuesday, October 27, 2026 8:00 AM
To: Ann Lee <ann@acme.test>
Subject: New vulnerabilities notification

3 new vulnerabilities were found.
`),
    ]);
    expect(people[0]).toMatchObject({
      name: 'Ann Lee',
      role: 'reporter',
      side: 'client',
    });
    expect(people.some((p) => p.side === 'automated')).toBe(false);
  });

  it('says a system started it when only automated mail is there', () => {
    const { people } = read([
      description(`
________________________________
From: workflows <workflows@acme.test>
Sent: Tuesday, October 27, 2026 8:00 AM
To: itsupport <itsupport@acme.test>
Subject: [ATTENTION] | Travel Request for Kurt Gielen

Kurt Gielen is traveling to Ethiopia.
`),
    ]);
    expect(people).toEqual([
      expect.objectContaining({
        name: 'workflows',
        side: 'automated',
        role: 'reporter',
      }),
    ]);
  });

  it('names no one when the mailbox wrote it unsigned', () => {
    const { people, entries } = read([
      description(`
________________________________
From: itsupport
Sent: Wednesday, August 26, 2026 10:38 AM
To: itsupport <itsupport@acme.test>
Subject: DNS filter example

IT Support
Service Desk & Technical Assistance
`),
    ]);
    expect(people).toEqual([]);
    expect(entries[0]).toMatchObject({ author: 'itsupport', side: 'msp' });
  });

  it('takes a technician’s notes and changes as theirs, and a merge note’s tickets', () => {
    const { entries, people, merged } = read([
      description(OUTLOOK),
      {
        id: 101,
        type: 'SAVE',
        appUserContactUid: 'u-jess',
        appUserContactType: 'TECHNICIAN',
        createTime: SECONDS('2026-10-27T09:00:00Z'),
      },
      {
        id: 102,
        type: 'COMMENT',
        appUserContactUid: 'u-sam',
        appUserContactType: 'TECHNICIAN',
        publicEntry: false,
        body: 'Tickets #8487, #8486 were closed and merged into this ticket',
        createTime: SECONDS('2026-10-27T10:00:00Z'),
      },
      {
        id: 103,
        type: 'INFO',
        system: true,
        body: 'A notification has not been sent as it matched the rule(s)',
        createTime: SECONDS('2026-10-27T10:00:00Z'),
      },
    ]);
    expect(entries.at(-1)).toMatchObject({
      id: '102',
      kind: 'comment',
      author: 'Sam Okafor',
      side: 'msp',
      public: false,
    });
    expect(entries).toHaveLength(4);
    expect(people).toContainEqual(
      expect.objectContaining({
        name: 'Jess Patel',
        via: 'activity',
        internal: true,
      }),
    );
    expect(merged).toEqual(['8487', '8486']);
  });

  it('keeps a reply someone wrote in the tool to their own words', () => {
    const { entries } = read(
      [
        {
          id: 7,
          type: 'COMMENT',
          appUserContactUid: 'u-sam',
          publicEntry: true,
          body: 'Mail is flowing again.\n\nOn Mon, 26 Oct 2026, Ann Lee <ann@acme.test> wrote:\n> Nobody can send',
          createTime: SECONDS('2026-10-27T10:00:00Z'),
        },
      ],
      'Ann Lee',
    );
    expect(entries).toEqual([
      expect.objectContaining({
        author: 'Sam Okafor',
        text: 'Mail is flowing again.',
      }),
    ]);
  });

  it('reads a ticket the tool’s requester raised, with no email in it', () => {
    const { entries, people } = read(
      [
        {
          id: 8,
          type: 'DESCRIPTION',
          publicEntry: true,
          body: 'The printer by reception is offline.',
          createTime: SECONDS('2026-10-27T10:00:00Z'),
        },
      ],
      'Ann Lee',
    );
    expect(entries[0]).toMatchObject({ author: 'Ann Lee', side: 'client' });
    expect(people).toEqual([
      expect.objectContaining({
        name: 'Ann Lee',
        role: 'reporter',
        via: 'requester',
      }),
    ]);
  });
});

describe('email headers', () => {
  it('reads the ways mail clients quote a message', () => {
    expect(
      emailThread(
        [
          'Thanks!',
          '',
          'On Thu, Aug 27, 2026 at 1:27 PM Linga Mbeki <',
          'Linga@acme.test> wrote:',
          '> Can we meet Friday?',
          '>',
          '> ------ Original Message ------',
          '> From "Smith, Jane" <jane@partner.test<mailto:jane@partner.test>>',
          '> To "Linga Mbeki" <Linga@acme.test>',
          '> Date 23/09/2026 12:37:58 PM',
          '> Subject Re: Reporting',
          '>',
          '> Here is the report.',
          '> On 1 Sep 2026, at 08:00, itsupport <itsupport@acme.test> wrote:',
          '> ---------- Forwarded message ---------',
          '> From: Bo Chen <bo@acme.test>',
          '> Date: Fri, Oct 2, 2026 at 6:08 PM',
          '> Subject: Housekeeping',
          '> To: Kia Lewis <Kia@acme.test>, BPI Team <BPI_team@acme.test>',
          '>',
          '> Reminder below.',
        ].join('\n'),
      ),
    ).toEqual({
      note: 'Thanks!',
      messages: [
        {
          from: { name: 'Linga Mbeki', email: 'linga@acme.test' },
          to: [],
          cc: [],
          sent: { wall: Date.UTC(2026, 7, 27, 13, 27), offsetMinutes: null },
          body: 'Can we meet Friday?',
        },
        {
          from: { name: 'Jane Smith', email: 'jane@partner.test' },
          to: [{ name: 'Linga Mbeki', email: 'linga@acme.test' }],
          cc: [],
          sent: {
            wall: Date.UTC(2026, 8, 23, 12, 37, 58),
            offsetMinutes: null,
          },
          body: 'Here is the report.',
        },
        {
          from: { name: 'itsupport', email: 'itsupport@acme.test' },
          to: [],
          cc: [],
          sent: { wall: Date.UTC(2026, 8, 1, 8, 0), offsetMinutes: null },
          body: '',
        },
        {
          from: { name: 'Bo Chen', email: 'bo@acme.test' },
          to: [
            { name: 'Kia Lewis', email: 'kia@acme.test' },
            { name: 'BPI Team', email: 'bpi_team@acme.test' },
          ],
          cc: [],
          sent: { wall: Date.UTC(2026, 9, 2, 18, 8), offsetMinutes: null },
          body: 'Reminder below.',
        },
      ],
    });
  });

  it('reads header times, with their zone when they give one', () => {
    expect(
      headerTime(
        'Monday, October 26, 2026 12:40:39 PM (UTC-04:00) Georgetown, La Paz',
      ),
    ).toEqual({ wall: Date.UTC(2026, 9, 26, 12, 40, 39), offsetMinutes: -240 });
    expect(headerTime('Thursday, 27 August 2026 at 22:24')).toEqual({
      wall: Date.UTC(2026, 7, 27, 22, 24),
      offsetMinutes: null,
    });
    // Month first only when the day can't be.
    expect(headerTime('09/23/2026 2:18 PM')?.wall).toBe(
      Date.UTC(2026, 8, 23, 14, 18),
    );
    expect(headerTime('next week')).toBeNull();
  });

  it('lists addresses either way they’re separated', () => {
    expect(
      addresses(
        'Smith, Jane <jane@partner.test>; kareem@x.test <kareem@x.test>',
      ),
    ).toEqual([
      { name: 'Jane Smith', email: 'jane@partner.test' },
      { name: null, email: 'kareem@x.test' },
    ]);
    expect(addresses('itsupport')).toEqual([
      { name: 'itsupport', email: null },
    ]);
  });

  it('finds the technician who signed a reply, above the mailbox’s signature', () => {
    const technicians = [...directory.values()];
    expect(
      signedBy(
        'Hi Kurt,\n\nDone.\n\nBest,\nSam\n\nIT Support\nE\nW',
        technicians,
      ),
    ).toEqual({
      person: directory.get('u-sam'),
      body: 'Hi Kurt,\n\nDone.\n\nBest,\nSam',
    });
    expect(signedBy('Thanks, Jess Patel', technicians)?.person.name).toBe(
      'Jess Patel',
    );
    // A greeting names who it's to, not who wrote it.
    expect(signedBy('Hi Sam,\n\nCan you help?', technicians)).toBeNull();
  });
});

describe('reconciling a client’s tickets', () => {
  /** The client's shared mailbox, which tells Dossier its domain. */
  const forwarded: Ticket['entries'][number] = {
    id: '0',
    at: '2026-10-26T09:00:00.000Z',
    author: 'Someone',
    email: null,
    side: null,
    via: 'itsupport@acme.test',
    kind: 'description',
    public: true,
    to: [],
    cc: [],
    text: 'Forwarded',
  };
  const ticket = (number: string, more: Partial<Ticket>): Ticket => ({
    id: `t-${number}`,
    clientId: 'acme',
    number,
    subject: `Ticket ${number}`,
    status: 'Open',
    open: true,
    urgency: 'normal',
    requester: 'itsupport@acme.test',
    assignedTo: null,
    openedAt: '2026-10-26T09:00:00.000Z',
    updatedAt: '2026-10-26T09:00:00.000Z',
    sourceId: `src-${number}`,
    entries: [forwarded],
    entriesAsOf: null,
    entriesComplete: true,
    entriesVersion: 2,
    people: [],
    mergedInto: null,
    ...more,
  });
  const person = (
    name: string,
    email: string | null,
    side: 'client' | 'outside' | 'msp',
    role: 'reporter' | 'involved' = 'involved',
  ) => ({ name, email, side, role, via: 'email' as const, internal: false });

  it('knows people by one name, from their personal address too', () => {
    const [first, second, third] = reconcileTickets([
      ticket('1', {
        people: [
          person('Kurt Gielen', 'kurt@acme.test', 'client', 'reporter'),
          person('Matilda Ibeh', 'matilda@partner.test', 'outside'),
        ],
      }),
      ticket('2', {
        people: [
          person('Kurt Gielen', 'kurt.gielen@gmail.com', 'outside', 'reporter'),
          person('matilda', 'matilda@partner.test', 'outside'),
        ],
        entries: [
          {
            id: '1',
            at: '2026-10-26T09:00:00.000Z',
            author: 'matilda',
            email: 'matilda@partner.test',
            side: 'outside',
            via: null,
            kind: 'description',
            public: true,
            to: ['Kurt Gielen'],
            cc: [],
            text: 'Hello',
          },
        ],
      }),
      ticket('3', {
        people: [
          person(
            'Linga Kalinde Mbeki',
            'linga3@hotmail.com',
            'outside',
            'reporter',
          ),
          person('Linga Mbeki', 'linga@acme.test', 'client'),
        ],
      }),
    ]);
    expect(first!.requester).toBe('Kurt Gielen');
    expect(second!.people).toEqual([
      expect.objectContaining({ name: 'Kurt Gielen', side: 'client' }),
      // A partner stays a partner, by their fullest name.
      expect.objectContaining({ name: 'Matilda Ibeh', side: 'outside' }),
    ]);
    expect(second!.entries[0]).toMatchObject({ author: 'Matilda Ibeh' });
    // A middle name on a personal address is still them.
    expect(third!.people).toEqual([
      expect.objectContaining({
        name: 'Linga Mbeki',
        side: 'client',
        role: 'reporter',
      }),
    ]);
    expect(third!.requester).toBe('Linga Mbeki');
  });

  it('trusts an address over a bare name for whose side someone is on', () => {
    const tickets = reconcileTickets([
      // A header with no address, taken for the client's.
      ticket('1', { people: [person('Matilda Ibeh', null, 'client')] }),
      ticket('2', {
        people: [person('Matilda Ibeh', 'matilda@partner.test', 'outside')],
      }),
      // Someone the client's address vouches for stays theirs.
      ticket('3', { people: [person('Kia Lewis', null, 'client')] }),
      ticket('4', { people: [person('Kia Lewis', 'kia@acme.test', 'client')] }),
    ]);
    expect(tickets.map((t) => t.people[0]!.side)).toEqual([
      'outside',
      'outside',
      'client',
      'client',
    ]);
  });

  it('comes to the same answer however often it runs', () => {
    const tickets = [
      ticket('1', {
        people: [
          person('Kurt Gielen', 'kurt@acme.test', 'client', 'reporter'),
          // Stored by an earlier, wrong reading: a partner taken for the
          // client's. Their address says otherwise.
          person('Matilda Ibeh', 'matilda@partner.test', 'client'),
        ],
      }),
      ticket('2', {
        people: [person('Kurt Gielen', 'kurt.gielen@gmail.com', 'outside')],
      }),
    ];
    const once = reconcileTickets(tickets);
    expect(once[0]!.people.map((p) => p.side)).toEqual(['client', 'outside']);
    expect(once[1]!.people.map((p) => p.side)).toEqual(['client']);
    expect(reconcileTickets(once)).toEqual(once);
  });

  it('marks a ticket a technician merged into another', () => {
    const tickets = reconcileTickets([
      ticket('8488', {
        entries: [
          {
            id: '9',
            at: '2026-10-27T09:00:00.000Z',
            author: 'Sam Okafor',
            email: null,
            side: 'msp',
            via: null,
            kind: 'comment',
            public: false,
            to: [],
            cc: [],
            text: 'Tickets #8487, #8486 were closed and merged into this ticket',
          },
        ],
      }),
      ticket('8487', {}),
      ticket('8480', {}),
    ]);
    expect(tickets.map((t) => t.mergedInto)).toEqual([null, '8488', null]);
    // Not read yet: the tool's requester stands.
    expect(tickets[1]!.requester).toBe('itsupport@acme.test');
  });
});
