import type { Client, Meeting, Source, Ticket } from '@dossierhq/contracts';
import { describe, expect, it } from 'vitest';
import {
  noteDocument,
  plainMarkdown,
  split,
  summaryDocument,
  ticketDocument,
  transcriptDocument,
  type People,
} from './chunking.js';

const client: Client = {
  id: 'harbour',
  name: 'Harbour Dental',
  industry: null,
  location: null,
  seats: null,
  primaryContact: null,
  contract: null,
  domains: [],
};
const people: People = { keys: new Set(['priyanair']) };

const ticket = (changes: Partial<Ticket> = {}): Ticket => ({
  id: 'ticket-1',
  clientId: 'harbour',
  number: '4821',
  subject: 'X-ray software won’t open',
  status: 'Open',
  open: true,
  urgency: 'high',
  requester: 'Priya Nair',
  assignedTo: 'Jess Patel',
  openedAt: '2026-10-05T09:00:00.000Z',
  updatedAt: '2026-10-07T09:00:00.000Z',
  sourceId: 'src-4821',
  entries: [
    {
      at: '2026-10-05T09:00:00.000Z',
      author: 'Priya Nair',
      kind: 'description',
      public: true,
      text: 'The X-ray viewer shows a licence error and closes.',
    },
    {
      at: '2026-10-06T09:00:00.000Z',
      author: 'Jess Patel',
      kind: 'comment',
      public: false,
      text: 'Licence service stopped after the patch. Restarted it.',
    },
    {
      at: '2026-10-07T09:00:00.000Z',
      author: 'Priya Nair',
      kind: 'comment',
      public: true,
      text: 'Thanks!',
    },
  ],
  entriesAsOf: '2026-10-07T09:00:00.000Z',
  ...changes,
});

describe('ticketDocument', () => {
  it('holds a card and each reply, internal notes only when shared', () => {
    const doc = ticketDocument(ticket(), client, people, true);
    expect(doc).toMatchObject({
      id: 'ticket:ticket-1',
      kind: 'ticket',
      record: 'tickets',
      tool: 'ninjaone',
      sourceId: 'src-4821',
      appendOnly: true,
      meta: { status: 'Open', assignedTo: 'Jess Patel' },
    });
    // "Thanks!" says nothing worth finding.
    expect(doc.chunks.map((c) => c.key)).toEqual([
      'card',
      expect.stringMatching(/^e:/),
      expect.stringMatching(/^e:/),
    ]);
    const [card, description, note] = doc.chunks;
    expect(card!.heading).toBe(
      'Ticket #4821 "X-ray software won’t open" · Harbour Dental · raised by Priya Nair · opened 2026-10-05',
    );
    expect(card!.personKeys).toEqual(['priyanair']);
    expect(description!.internal).toBe(false);
    expect(note).toMatchObject({
      internal: true,
      heading:
        'Ticket #4821 "X-ray software won’t open" · Harbour Dental · internal note by Jess Patel · 2026-10-06',
      meta: { author: 'Jess Patel', public: false },
    });
    // Jess is the MSP's, so only Priya is tagged.
    expect(note!.personKeys).toEqual(['priyanair']);

    const shared = ticketDocument(ticket(), client, people, false);
    expect(shared.chunks.some((c) => c.internal)).toBe(false);
  });

  it('keeps its passages when the ticket only moves along', () => {
    const before = ticketDocument(ticket(), client, people, true);
    const after = ticketDocument(
      ticket({
        status: 'Waiting',
        assignedTo: 'Sam Okafor',
        updatedAt: '2026-10-09T00:00:00.000Z',
      }),
      client,
      people,
      true,
    );
    expect(after.contentHash).toBe(before.contentHash);
    expect(after.chunks).toEqual(before.chunks);
    expect(after.meta).not.toEqual(before.meta);
  });

  it('cuts a long reply into pieces with keys of their own', () => {
    const long = Array.from(
      { length: 12 },
      (_, i) =>
        `Paragraph ${i}. ${'The backup job failed again overnight. '.repeat(10)}`,
    ).join('\n\n');
    const doc = ticketDocument(
      ticket({
        entries: [
          {
            at: '2026-10-05T09:00:00.000Z',
            author: 'Priya Nair',
            kind: 'description',
            public: true,
            text: long,
          },
        ],
      }),
      client,
      people,
      true,
    );
    const pieces = doc.chunks.filter((c) => c.key.startsWith('e:'));
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.map((c) => c.key.split(':').at(-1))).toEqual(
      pieces.map((_, i) => String(i)),
    );
    for (const piece of pieces)
      expect(piece.body.length).toBeLessThanOrEqual(3_200);
  });
});

describe('summaryDocument and noteDocument', () => {
  const meeting: Meeting = {
    id: 'meeting-1',
    clientId: 'harbour',
    title: 'Monthly check-in',
    occurredAt: '2026-09-30T13:00:00.000Z',
    durationMinutes: 30,
    attendees: [
      { name: 'Priya Nair', role: 'client' },
      { name: 'Sam Okafor', role: 'msp' },
    ],
    planning: [],
    concerns: [],
    askedFor: [],
    readAt: null,
    recordingSourceId: 'src-rec',
  };
  const recording = (summary: string | null): Source => ({
    id: 'src-rec',
    kind: 'record',
    tool: 'fathom',
    clientId: 'harbour',
    recordId: 'CALL-1',
    recordType: 'Recording',
    title: 'Monthly check-in',
    recordedAt: '2026-09-30T13:00:00.000Z',
    url: 'https://fathom.video/calls/1',
    fields: summary === null ? [] : [{ label: 'Summary', value: summary }],
  });

  it('reads Fathom’s summary in sections, without its links', () => {
    const doc = summaryDocument(
      meeting,
      recording(
        '## Backups\n- [**Restore test** before month end](https://fathom.video/x?timestamp=1)\n\n## Surgery seven\n- Opens in November',
      ),
      client,
      people,
    );
    expect(doc).toMatchObject({
      id: 'summary:meeting-1',
      kind: 'summary',
      record: 'meetings',
      sourceId: 'src-rec',
      appendOnly: false,
    });
    expect(doc!.chunks[0]!.body).toContain('- Restore test before month end');
    expect(doc!.chunks[0]!.body).not.toContain('https://');
    expect(doc!.chunks[0]!.heading).toBe(
      'Meeting summary · "Monthly check-in" · Harbour Dental · 2026-09-30 · with Priya Nair',
    );
    expect(doc!.chunks[0]!.personKeys).toEqual(['priyanair']);
    expect(
      summaryDocument(meeting, recording(null), client, people),
    ).toBeNull();
    expect(plainMarkdown('**Bold** and [a link](https://x.example)')).toBe(
      'Bold and a link',
    );
  });

  it('keeps passwords out of notes', () => {
    const doc = noteDocument(
      {
        id: 'note-1',
        clientId: 'harbour',
        title: 'Site visit',
        occurredOn: '2026-10-02',
        attendees: ['Priya Nair'],
        body: 'Reset the router.\n\nThe admin password: Hunter2! for the portal.',
        via: 'paste',
        addedBy: { userId: 'u1', name: 'Sam Okafor' },
        createdAt: '2026-10-02T10:00:00.000Z',
        planning: [],
        concerns: [],
        askedFor: [],
        readAt: null,
      },
      null,
      client,
      people,
    );
    expect(doc!.chunks.map((c) => c.body).join('\n')).toContain(
      'password: [redacted]',
    );
    expect(doc!.chunks.map((c) => c.body).join('\n')).not.toContain('Hunter2');
  });

  it('splits at paragraphs, then sentences', () => {
    expect(split('One.\n\nTwo.', 100)).toEqual(['One.\n\nTwo.']);
    expect(split('One.\n\nTwo.', 6)).toEqual(['One.', 'Two.']);
    const pieces = split(`${'Short sentence here. '.repeat(20)}`, 100);
    expect(pieces.every((p) => p.length <= 100)).toBe(true);
  });
});

describe('transcriptDocument', () => {
  const turns = Array.from({ length: 30 }, (_, i) => ({
    at: `00:${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
    speaker: i % 2 ? 'Sam Okafor' : 'Priya Nair',
    email: null,
    role: (i % 2 ? 'msp' : 'client') as 'msp' | 'client',
    text: `${i % 2 ? 'We can' : 'We need'} ${'to talk about the backups and the new site '.repeat(3)}${i}`,
  }));
  const transcript = {
    meetingId: 'meeting-1',
    clientId: 'harbour',
    recordingId: '9001',
    title: 'Monthly check-in',
    occurredAt: '2026-09-30T13:00:00.000Z',
    url: 'https://fathom.video/calls/9001',
    recordingSourceId: 'src-rec',
    turns,
  };

  it('cuts it into overlapping stretches of whole turns, each citing a moment the client spoke', () => {
    const built = transcriptDocument(transcript, client, people)!;
    const { document, moments } = built;
    expect(document).toMatchObject({
      id: 'transcript:meeting-1',
      kind: 'transcript',
      record: 'meetings',
      tool: 'fathom',
      sourceId: 'src-rec',
    });
    expect(document.chunks.length).toBeGreaterThan(2);
    for (const chunk of document.chunks) {
      expect(chunk.key).toMatch(/^t:\d{2}:\d{2}:\d{2}$/);
      expect(chunk.body.length).toBeLessThanOrEqual(2_200);
      expect(chunk.personKeys).toEqual(['priyanair']);
    }
    // One turn is shared between neighbours, so no exchange is cut in two.
    const [first, second] = document.chunks;
    const lastOfFirst = first!.body.split('\n').at(-1);
    expect(second!.body.split('\n')[0]).toBe(lastOfFirst);
    // Every stretch cites a moment of Priya's, linked to its second.
    expect(moments).toHaveLength(document.chunks.length);
    expect(moments[0]).toMatchObject({
      kind: 'meeting',
      speakerRole: 'client',
      speakerName: 'Priya Nair',
      recordType: 'Transcript',
    });
    expect(moments[0]!.url).toMatch(
      /^https:\/\/fathom\.video\/calls\/9001\?timestamp=\d+$/,
    );
    expect(document.chunks[0]!.sourceId).toBe(moments[0]!.id);
  });
});
