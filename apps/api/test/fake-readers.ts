import type { ModelRequest } from '../src/intelligence/model.js';

/** The entries a ticket context shows, by handle, with whether each is internal. */
export function entriesOf(context: string) {
  return [
    ...context.matchAll(
      /^\[(E\d+)\] \S+(?: [^(\n]+)? \((public|internal)\):/gm,
    ),
  ].map((m) => ({ handle: m[1]!, internal: m[2] === 'internal' }));
}

/**
 * What a reading model answers, for the reading prompts Dossier sends, or
 * null for any other prompt. Every fake model delegates to it, so suites
 * that never meant to read anything still get answers of the right shape.
 */
export function fakeRead(req: ModelRequest<unknown>): unknown | null {
  if (req.context.startsWith('<ticket_record>')) {
    const entries = entriesOf(req.context);
    const first = entries[0]?.handle;
    const internal = entries.find((e) => e.internal)?.handle;
    const publics = entries.filter((e) => !e.internal).map((e) => e.handle);
    const subject = /"([^"]+)"/.exec(req.context)?.[1] ?? 'the ticket';
    const device = /Devices at this client: ([^ (]+)/.exec(req.context)?.[1];
    return {
      summary: `Read: ${subject}.`,
      issue: subject,
      category: 'email',
      symptoms: ['It stopped working'],
      tried: [
        ...(internal
          ? [{ text: 'Checked the settings', entries: [internal] }]
          : []),
        ...(first ? [{ text: 'Asked the client', entries: [first] }] : []),
        { text: 'Made up', entries: ['E99'] },
      ],
      rootCause: internal
        ? { text: 'A settings change', entries: [internal] }
        : null,
      resolution: first ? { text: 'Put it back', entries: [first] } : null,
      outcome: 'resolved',
      sentiment: 'calm',
      people: [{ name: 'Priya Shah', role: 'client' }],
      devices: device ? [device] : [],
      followUps: [],
      executive: {
        headline: `Sorted: ${subject}`,
        points: ['It is working again.'],
        decision: null,
      },
      executiveEntries: publics.slice(0, 1),
    };
  }
  if (req.context.startsWith('<client_tickets>')) {
    const handles = [
      ...new Set([...req.context.matchAll(/\[(S\d+)\]/g)].map((m) => m[1]!)),
    ];
    return {
      themes:
        handles.length >= 2
          ? [
              {
                title: 'Email keeps going down',
                summary: 'Several tickets about mail stopping.',
                trend: 'growing',
                tickets: [...handles.slice(0, 2), 'S999'],
                executive: {
                  headline: 'Email outages keep interrupting the practice',
                  points: ['We recommend fixing the cause once.'],
                  decision: 'Approve a review of the mail setup.',
                },
              },
              {
                title: 'Rests on one ticket',
                summary: 'Not a pattern.',
                trend: 'new',
                tickets: handles.slice(0, 1),
                executive: { headline: 'No', points: [], decision: null },
              },
            ]
          : [],
    };
  }
  if (req.context.startsWith('<person_records>')) {
    const handle = /\[(S\d+)/.exec(req.context)?.[1];
    const name = /^# ([^·]+) ·/m.exec(req.context)?.[1]?.trim() ?? 'They';
    return {
      summary: `${name} is known from their records.`,
      recurring: handle
        ? [
            { text: 'Keeps having trouble', sources: [handle] },
            { text: 'Made up', sources: ['S999'] },
          ]
        : [],
      devices: [],
      tone: { trend: 'steady', note: 'Calm and clear.' },
      openLoops: [],
      executive: {
        headline: `${name}’s IT is being looked after`,
        points: ['Their recent problems were fixed.'],
        decision: null,
      },
    };
  }
  return null;
}
