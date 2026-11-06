import {
  SUMMARY_FIELD,
  type Client,
  type Device,
  type Meeting,
  type MeetingNote,
  type MeetingSource,
  type MeetingTranscript,
  type TranscriptTurn,
  type Source,
  type Ticket,
  type TicketEntry,
  type TicketInsight,
} from '@dossierhq/contracts';
import type {
  MemoryChunkInput,
  MemoryDocumentInput,
} from '@dossierhq/database';
import { personKey } from '../clients/end-users.js';
import { oneLine, stableHash } from '../integrations/ids.js';
import { redact } from '../integrations/redact.js';

/**
 * How documents are cut into passages. Changing the rules changes this, so
 * every passage is written, and embedded, again once.
 */
export const CHUNK_VERSION = 'memory-1';
/** About 800 tokens: long enough to hold a reply, short enough to be about one thing. */
const CHUNK_CHARS = 3_200;
/** Sections of a summary or notes are packed up to this. */
const SECTION_CHARS = 2_400;
const HEADING_CHARS = 220;
/** How much of a ticket's description its card carries. */
const CARD_DESCRIPTION_CHARS = 600;
/** Labels that suggest a secret; such fields are never remembered. */
const SENSITIVE = /pass|secret|key|pin|token|credential|otp|recovery/i;
/** Replies that say nothing worth finding. */
const TRIVIAL =
  /^(?:thanks?(?: you)?|thank you(?: so much)?|ok(?:ay)?|cheers|great|perfect|noted|will do|done)[.!]*$/i;

/** A document built from the records, before diffing with what's stored. */
export type BuiltDocument = Omit<
  MemoryDocumentInput,
  'removedKeys' | 'sources'
> & {
  /** The sources to keep for citing it later. */
  sourceIds: string[];
  /**
   * Passages that leave the tool stay remembered: a ticket's comments past
   * the last few NinjaOne keeps. Otherwise the passages are replaced as a set.
   */
  appendOnly: boolean;
};

/** Who at a client the records mention, keyed as the person pages are. */
export type People = {
  /** The client's people, by person key. */
  keys: Set<string>;
};

/** The keys of those named who are the client's people; never the MSP's. */
export function peopleIn(
  people: People,
  ...names: (string | null | undefined)[]
): string[] {
  const keys = names.flatMap((name) => (name ? (personKey(name) ?? []) : []));
  return [...new Set(keys.filter((key) => people.keys.has(key)))].sort();
}

const day = (iso: string) => iso.slice(0, 10);
const hashOf = (...parts: unknown[]) =>
  stableHash(CHUNK_VERSION, JSON.stringify(parts));

/** Text cut at paragraph breaks into pieces of at most `max` characters. */
export function split(text: string, max = CHUNK_CHARS): string[] {
  const pieces: string[] = [];
  let current = '';
  const push = () => {
    if (current.trim()) pieces.push(current.trim());
    current = '';
  };
  for (const paragraph of text.split(/\n{2,}/)) {
    if (paragraph.length > max) {
      push();
      // One very long paragraph: cut at sentence ends, else hard.
      let rest = paragraph;
      while (rest.length > max) {
        const cut = rest.lastIndexOf('. ', max);
        const at = cut > max / 2 ? cut + 1 : max;
        pieces.push(rest.slice(0, at).trim());
        rest = rest.slice(at);
      }
      current = rest;
      continue;
    }
    if (current && current.length + paragraph.length + 2 > max) push();
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  push();
  return pieces;
}

function chunk(
  key: string,
  heading: string,
  body: string,
  extra: {
    occurredAt: string;
    internal?: boolean;
    personKeys?: string[];
    meta?: Record<string, unknown>;
    sourceId?: string | null;
  },
): MemoryChunkInput {
  const head = oneLine(heading, HEADING_CHARS);
  const internal = extra.internal ?? false;
  return {
    key,
    internal,
    personKeys: extra.personKeys ?? [],
    occurredAt: extra.occurredAt,
    heading: head,
    body,
    meta: extra.meta ?? {},
    sourceId: extra.sourceId ?? null,
    contentHash: hashOf(head, body, internal, extra.personKeys ?? []),
  };
}

/**
 * A key for a ticket entry that stays the same while the entry does: the
 * tool's ID for it, or, for entries read before Dossier kept those, a hash.
 */
const entryKey = (entry: TicketEntry) =>
  entry.id
    ? `e:${entry.id}`
    : `e:${stableHash(entry.at, entry.author ?? '', entry.kind)}`;

const documentHash = (chunks: MemoryChunkInput[]) =>
  hashOf(chunks.map((c) => `${c.key}=${c.contentHash}`).sort());

/**
 * A ticket's conversation: a card saying what it's about, and each reply or
 * note. Headings carry nothing that changes (status, assignee), so moving a
 * ticket along never re-embeds it. Internal notes only when shared.
 */
export function ticketDocument(
  ticket: Ticket,
  client: Client,
  people: People,
  includeInternal: boolean,
  tool: Source['tool'] = 'ninjaone',
  insight: TicketInsight | null = null,
): BuiltDocument {
  const about = `Ticket #${ticket.number} "${oneLine(ticket.subject, 120)}" · ${client.name}`;
  const raisedBy = ticket.requester ? ` · raised by ${ticket.requester}` : '';
  // Whoever raised it, and the client's people on it.
  const requester = [
    ...new Set([
      ...peopleIn(people, ticket.requester),
      ...ticket.people
        .filter(
          (person) =>
            person.side === 'client' && (includeInternal || !person.internal),
        )
        .flatMap((person) => peopleIn(people, person.name)),
    ]),
  ].sort();
  const description = ticket.entries.find((e) => e.kind === 'description');
  const card = chunk(
    'card',
    `${about}${raisedBy} · opened ${day(ticket.openedAt)}`,
    [
      ticket.subject,
      description?.public || includeInternal
        ? oneLine(description?.text ?? '', CARD_DESCRIPTION_CHARS)
        : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    { occurredAt: ticket.openedAt, personKeys: requester },
  );
  const entries = ticket.entries
    .filter((entry) => entry.public || includeInternal)
    .filter((entry) => !TRIVIAL.test(entry.text.trim()))
    .flatMap((entry) => {
      const what =
        entry.kind === 'description'
          ? 'description'
          : entry.kind === 'email'
            ? 'email'
            : entry.public
              ? 'reply'
              : 'internal note';
      const by = entry.author ? ` by ${entry.author}` : '';
      const heading = `${about} · ${what}${by} · ${day(entry.at)}`;
      const pieces = split(entry.text);
      return pieces.map((piece, index) =>
        chunk(
          pieces.length === 1 ? entryKey(entry) : `${entryKey(entry)}:${index}`,
          heading,
          piece,
          {
            occurredAt: entry.at,
            internal: !entry.public,
            personKeys: [
              ...new Set([...requester, ...peopleIn(people, entry.author)]),
            ].sort(),
            meta: {
              author: entry.author,
              kind: entry.kind,
              public: entry.public,
            },
          },
        ),
      );
    });
  // What Dossier read off it: the issue, how it went, how it was fixed. The
  // passage similar tickets are found by.
  const read =
    insight && (includeInternal || !insight.withInternal)
      ? [
          chunk(
            'summary',
            `${about} · Dossier's read`,
            [
              insight.issue,
              insight.summary,
              insight.symptoms.length > 0
                ? `Symptoms: ${insight.symptoms.join('; ')}`
                : '',
              insight.rootCause ? `Cause: ${insight.rootCause.text}` : '',
              insight.resolution ? `Fixed by: ${insight.resolution.text}` : '',
              `Outcome: ${insight.outcome}`,
            ]
              .filter(Boolean)
              .join('\n'),
            {
              occurredAt: ticket.openedAt,
              internal: insight.withInternal,
              personKeys: requester,
              meta: { outcome: insight.outcome, category: insight.category },
            },
          ),
        ]
      : [];
  const chunks = [card, ...read, ...entries];
  return {
    id: `ticket:${ticket.id}`,
    clientId: ticket.clientId,
    kind: 'ticket',
    record: 'tickets',
    tool,
    refId: ticket.id,
    noteId: null,
    sourceId: ticket.sourceId,
    title: `#${ticket.number} ${oneLine(ticket.subject, 160)}`,
    occurredAt: ticket.openedAt,
    meta: {
      number: ticket.number,
      status: ticket.status,
      open: ticket.open,
      urgency: ticket.urgency,
      requester: ticket.requester,
      assignedTo: ticket.assignedTo,
      updatedAt: ticket.updatedAt,
    },
    contentHash: documentHash(chunks),
    chunks,
    sourceIds: [ticket.sourceId],
    // Passages of entries no longer in the list are dropped, unless the list
    // may be missing some: then they're kept, as memory of what was written.
    appendOnly: !ticket.entriesComplete,
  };
}

/** Markdown as plain text: links keep their words, emphasis goes. */
export const plainMarkdown = (markdown: string) =>
  markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__/g, '')
    .replace(/^[ \t]*[-*][ \t]+/gm, '- ')
    .replace(/[ \t]+$/gm, '');

/** Sections packed into passages of at most SECTION_CHARS. */
function sections(text: string, splitAt: RegExp): string[] {
  const parts = text
    .split(splitAt)
    .map((part) => part.trim())
    .filter(Boolean);
  const packed: string[] = [];
  let current = '';
  for (const part of parts.flatMap((p) => split(p, SECTION_CHARS))) {
    if (current && current.length + part.length + 2 > SECTION_CHARS) {
      packed.push(current);
      current = '';
    }
    current = current ? `${current}\n\n${part}` : part;
  }
  if (current) packed.push(current);
  return packed;
}

/** A recorded meeting's summary, as Fathom wrote it, in sections. */
export function summaryDocument(
  meeting: Meeting,
  recording: Source,
  client: Client,
  people: People,
): BuiltDocument | null {
  const summary = recording.fields.find(
    (f) => f.label === SUMMARY_FIELD,
  )?.value;
  if (!summary?.trim()) return null;
  const attendees = meeting.attendees.filter((a) => a.role === 'client');
  const who = attendees.map((a) => a.name).join(', ');
  const heading = `Meeting summary · "${oneLine(meeting.title, 120)}" · ${client.name} · ${day(meeting.occurredAt)}${who ? ` · with ${who}` : ''}`;
  const personKeys = peopleIn(people, ...attendees.map((a) => a.name));
  const chunks = sections(redact(plainMarkdown(summary)), /\n(?=#{1,3}\s)/).map(
    (body, index) =>
      chunk(`s:${index}`, heading, body, {
        occurredAt: meeting.occurredAt,
        personKeys,
      }),
  );
  if (chunks.length === 0) return null;
  return {
    id: `summary:${meeting.id}`,
    clientId: meeting.clientId,
    kind: 'summary',
    record: 'meetings',
    tool: 'fathom',
    refId: meeting.id,
    noteId: null,
    sourceId: recording.id,
    title: meeting.title,
    occurredAt: meeting.occurredAt,
    meta: { durationMinutes: meeting.durationMinutes },
    contentHash: documentHash(chunks),
    chunks,
    sourceIds: [recording.id],
    appendOnly: false,
  };
}

/** Notes the team wrote or forwarded, filed with a client. */
export function noteDocument(
  note: MeetingNote & { clientId: string },
  source: Source | null,
  client: Client,
  people: People,
): BuiltDocument | null {
  const attendees = note.attendees.join(', ');
  const heading = `Team notes · "${oneLine(note.title, 120)}" · ${client.name} · ${note.occurredOn}${attendees ? ` · ${attendees}` : ''}`;
  const occurredAt = `${note.occurredOn}T12:00:00.000Z`;
  const personKeys = peopleIn(people, ...note.attendees);
  const chunks = sections(redact(note.body), /\n{2,}/).map((body, index) =>
    chunk(`n:${index}`, heading, body, { occurredAt, personKeys }),
  );
  if (chunks.length === 0) return null;
  return {
    id: `note:${note.id}`,
    clientId: note.clientId,
    kind: 'note',
    record: 'notes',
    tool: null,
    refId: note.id,
    noteId: note.id,
    sourceId: source?.id ?? null,
    title: note.title,
    occurredAt,
    meta: { via: note.via, addedBy: note.addedBy.name },
    contentHash: documentHash(chunks),
    chunks,
    sourceIds: source ? [source.id] : [],
    appendOnly: false,
  };
}

/** A record's fields as lines, leaving out any that look secret. */
const fieldLines = (source: Source) =>
  source.fields
    .filter((f) => !SENSITIVE.test(f.label) && f.value.trim())
    .map((f) => `${f.label}: ${oneLine(f.value, 300)}`);

/** A device alert, kept after it clears so its history can be found. */
export function alertDocument(
  source: Source,
  client: Client,
  devices: Device[],
  people: People,
): BuiltDocument {
  const deviceName = source.fields.find((f) => f.label === 'Device')?.value;
  const device = devices.find((d) => d.name === deviceName);
  const severity = source.fields.find((f) => f.label === 'Severity')?.value;
  const on = device
    ? ` on ${device.name} (${device.type}${device.assignedTo ? `, used by ${device.assignedTo}` : ''})`
    : deviceName
      ? ` on ${deviceName}`
      : '';
  const heading = `Alert${on} · ${client.name} · ${day(source.recordedAt)}${severity ? ` · ${severity}` : ''}`;
  const chunks = [
    chunk('a', heading, [source.title, ...fieldLines(source)].join('\n'), {
      occurredAt: source.recordedAt,
      personKeys: peopleIn(people, device?.assignedTo),
      meta: { deviceId: device?.id ?? null },
    }),
  ];
  return {
    id: `alert:${source.id}`,
    clientId: client.id,
    kind: 'alert',
    record: 'devices',
    tool: source.tool,
    refId: source.id,
    noteId: null,
    sourceId: source.id,
    title: source.title,
    occurredAt: source.recordedAt,
    meta: { deviceId: device?.id ?? null },
    contentHash: documentHash(chunks),
    chunks,
    sourceIds: [source.id],
    appendOnly: false,
  };
}

/** A documented asset, website or expiry date, as it stands in Hudu. */
export function assetDocument(source: Source, client: Client): BuiltDocument {
  const heading = `Hudu ${source.recordType} "${oneLine(source.title, 120)}" · ${client.name}`;
  const chunks = [
    chunk('h', heading, [source.title, ...fieldLines(source)].join('\n'), {
      occurredAt: source.recordedAt,
    }),
  ];
  return {
    id: `asset:${source.id}`,
    clientId: client.id,
    kind: 'asset',
    record: 'documentation',
    tool: source.tool,
    refId: source.id,
    noteId: null,
    sourceId: source.id,
    title: source.title,
    occurredAt: source.recordedAt,
    meta: { recordType: source.recordType },
    contentHash: documentHash(chunks),
    chunks,
    sourceIds: [source.id],
    appendOnly: false,
  };
}

/** About 500 tokens of turns a passage: a stretch of conversation. */
const WINDOW_CHARS = 2_000;

const seconds = (at: string) => {
  const [h = 0, m = 0, s = 0] = at.split(':').map(Number);
  return h * 3600 + m * 60 + s;
};

const roleName = (role: TranscriptTurn['role']) =>
  role === 'client' ? 'client' : role === 'msp' ? 'MSP' : 'unknown';

/**
 * A recorded meeting's transcript, in stretches of whole turns that overlap
 * by one, so no exchange is cut in two. Each stretch where the client spoke
 * cites a moment: the turn of theirs that says most, linked to that second
 * of the recording, so what someone said can be shown as theirs.
 */
export function transcriptDocument(
  transcript: MeetingTranscript,
  client: Client,
  people: People,
): { document: BuiltDocument; moments: MeetingSource[] } | null {
  const windows: TranscriptTurn[][] = [];
  let current: TranscriptTurn[] = [];
  let size = 0;
  for (const turn of transcript.turns) {
    const line = turn.text.length + turn.speaker.length + 24;
    if (current.length > 0 && size + line > WINDOW_CHARS) {
      windows.push(current);
      const last = current.at(-1)!;
      current = [last];
      size = last.text.length + last.speaker.length + 24;
    }
    current.push(turn);
    size += line;
  }
  if (current.length > 0 && !(windows.length > 0 && current.length === 1)) {
    windows.push(current);
  }
  if (windows.length === 0) return null;

  const day = transcript.occurredAt.slice(0, 10);
  const start = Date.parse(transcript.occurredAt);
  const moments: MeetingSource[] = [];
  const chunks = windows.flatMap((turns) => {
    const from = turns[0]!.at;
    const to = turns.at(-1)!.at;
    const body = turns
      .map((t) => `[${t.at}] ${t.speaker} (${roleName(t.role)}): ${t.text}`)
      .join('\n');
    const said = turns
      .filter((t) => t.role === 'client')
      .sort((a, b) => b.text.length - a.text.length)[0];
    let moment: MeetingSource | null = null;
    if (said) {
      const at = seconds(said.at);
      moment = {
        id: `moment-${stableHash(transcript.meetingId, from)}`,
        kind: 'meeting',
        tool: 'fathom',
        clientId: client.id,
        meetingId: transcript.meetingId,
        transcriptAt: said.at,
        speakerRole: 'client',
        speakerName: said.speaker,
        quote: oneLine(said.text, 300),
        recordId: `REC-${transcript.recordingId} ${said.at}`,
        recordType: 'Transcript',
        title: oneLine(`${said.speaker} in "${transcript.title}"`, 200),
        recordedAt: new Date(start + at * 1000).toISOString(),
        url: `${transcript.url}${transcript.url.includes('?') ? '&' : '?'}timestamp=${at}`,
        fields: [],
      };
      moments.push(moment);
    }
    const speakers = [
      ...new Set(
        turns.filter((t) => t.role === 'client').map((t) => t.speaker),
      ),
    ];
    return split(body, CHUNK_CHARS).map((piece, index, pieces) =>
      chunk(
        pieces.length === 1 ? `t:${from}` : `t:${from}:${index}`,
        `Meeting transcript · "${oneLine(transcript.title, 120)}" · ${client.name} · ${day} · ${from}–${to}`,
        piece,
        {
          occurredAt: new Date(start + seconds(from) * 1000).toISOString(),
          personKeys: peopleIn(people, ...speakers),
          sourceId: moment?.id ?? null,
          meta: { from, to, speakers },
        },
      ),
    );
  });
  return {
    document: {
      id: `transcript:${transcript.meetingId}`,
      clientId: transcript.clientId,
      kind: 'transcript',
      record: 'meetings',
      tool: 'fathom',
      refId: transcript.meetingId,
      noteId: null,
      sourceId: transcript.recordingSourceId,
      title: transcript.title,
      occurredAt: transcript.occurredAt,
      meta: { recordingId: transcript.recordingId },
      contentHash: documentHash(chunks),
      chunks,
      sourceIds: [transcript.recordingSourceId],
      appendOnly: false,
    },
    moments,
  };
}

/** What Voyage embeds for a passage: where it's from, then what it says. */
export const embeddingText = (c: { heading: string; body: string }) =>
  `${c.heading}\n\n${c.body}`;
