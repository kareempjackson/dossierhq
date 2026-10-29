import {
  SUMMARY_FIELD,
  type CitedText,
  type Meeting,
  type MeetingNote,
  type NoteSource,
} from '@dossierhq/contracts';
import type { DatabaseAdapter, MeetingPointsRecord } from '@dossierhq/database';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AppConfig } from '../config/configuration.js';
import { DATABASE } from '../database/database.module.js';
import { DAY_MS, oneLine } from '../integrations/ids.js';
import { noteSource } from '../notes/note-source.js';
import { IntelligenceService } from './intelligence.service.js';
import { IntelligenceFailure } from './model.js';
import { DOSSIER_SYSTEM } from './prompts.js';

/** Bump when the task changes, so every meeting is read again. */
const EXTRACT_VERSION = 1;
/** Most points in each group. */
const MAX_POINTS = 5;
/** Meetings and notes read: the latest few, and any this recent. */
const LATEST = 10;
const RECENT_DAYS = 30;
/** The most of a summary or notes the model reads. */
const BODY_CHARS = 20_000;
/** After a failure, unchanged input waits this long before another try. */
const RETRY_AFTER_MS = 60 * 60 * 1000;
/** The one handle the context gives the meeting or notes being read. */
const HANDLE = 'S1';

const pointSchema = z.object({
  text: z
    .string()
    .describe('What the client said, in one short line of your own words.'),
  sources: z
    .array(z.string())
    .describe('Handles of the records it rests on, such as "S1".'),
  quote: z
    .string()
    .nullable()
    .describe(
      'The exact words in the notes the point comes from, copied character for character; null for a meeting summary, or when no short passage fits.',
    ),
});

const pointsSchema = z.object({
  planning: z.array(pointSchema),
  concerns: z.array(pointSchema),
  askedFor: z.array(pointSchema),
});
type Point = z.infer<typeof pointSchema>;

/** A meeting or notes to read, as the model will see it. */
type Subject = {
  id: string;
  kind: 'meeting' | 'note';
  /** `YYYY-MM-DD`. */
  day: string;
  context: string;
  hash: string;
  /** What the points cite when they cite the whole thing. */
  sourceId: string;
  /** Notes, to find quotes in and cite; null for a meeting. */
  note: (MeetingNote & { clientId: string }) | null;
};

/** For checking a quote is really in the notes: case, spacing and curly quotes aside. */
const loosely = (text: string) =>
  text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** Synced or typed text, made safe to sit inside the records tag. */
const fenced = (text: string) =>
  text.replace(/<\/?client_records>/gi, '').slice(0, BODY_CHARS);

const hashOf = (...parts: unknown[]) =>
  createHash('sha256')
    .update(JSON.stringify([EXTRACT_VERSION, ...parts]))
    .digest('hex');

function task(subject: Subject, today: string): string {
  const what = subject.kind === 'meeting' ? 'the meeting' : 'the notes';
  return [
    `Today is ${today}.`,
    '',
    `Task: read ${what} above and list what the client said, in three groups:`,
    '- planning: changes, projects, purchases or moves the client is planning.',
    '- concerns: what the client is worried or unhappy about.',
    '- askedFor: what the client asked the MSP to do, find out or look into.',
    '',
    `At most ${MAX_POINTS} in each group, the most important first. Only what the client said or clearly wants; leave out what the MSP said it would do, which Dossier tracks as promises. Leave a group empty when nothing fits; an empty answer is fine.`,
    `Write each point as one short, plain line naming the system, person, number or date that matters, and cite ${HANDLE}.`,
    subject.kind === 'note'
      ? 'For each point, also give quote: the words in the notes it comes from, copied exactly, a phrase or a sentence long. Use null when no single passage fits.'
      : 'Set quote to null.',
  ].join('\n');
}

/**
 * Reads what clients said in meetings: from Fathom's summary of each
 * recording, and from notes the team added. Saves the points apart from the
 * meetings, which syncs replace; each meeting is read again only when what
 * it says changes.
 */
@Injectable()
export class MeetingPointsExtractor {
  private readonly logger = new Logger(MeetingPointsExtractor.name);
  private readonly webUrl: string;

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly intelligence: IntelligenceService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.webUrl = config.get('WEB_URL', { infer: true });
  }

  /** Reads a client's new or changed meetings and notes. Returns how many. */
  async extract(workspaceId: string, clientId: string): Promise<number> {
    if (!this.intelligence.enabled) return 0;
    const { outputs, records } =
      await this.intelligence.preferences(workspaceId);
    if (!outputs.meetingNotes || !(records.meetings || records.notes)) return 0;

    const client = await this.db.clients.get(workspaceId, clientId);
    if (!client) return 0;
    const [meetings, notes, sources] = await Promise.all([
      records.meetings
        ? this.db.meetings.list(workspaceId, { clientId })
        : Promise.resolve([]),
      records.notes
        ? this.db.notes.list(workspaceId, clientId)
        : Promise.resolve([]),
      this.db.sources.listForClient(workspaceId, clientId),
    ]);
    const summaries = new Map(
      sources.map((s) => [
        s.id,
        s.fields.find((f) => f.label === SUMMARY_FIELD)?.value,
      ]),
    );
    const subjects = this.chosen([
      ...meetings.flatMap((m) =>
        this.ofMeeting(client.name, m, summaries.get(m.recordingSourceId)),
      ),
      ...notes.flatMap((n) => this.ofNotes(client.name, n)),
    ]);
    if (subjects.length === 0) return 0;

    const states = new Map(
      (
        await this.db.meetingPoints.states(
          workspaceId,
          subjects.map((s) => s.id),
        )
      ).map((state) => [state.id, state]),
    );
    let read = 0;
    for (const subject of subjects) {
      const state = states.get(subject.id);
      if (state?.inputHash === subject.hash) {
        if (state.status === 'ok') continue;
        const tried = Date.now() - Date.parse(state.attemptedAt);
        if (tried < RETRY_AFTER_MS) continue;
      }
      await this.read(workspaceId, clientId, subject, state);
      read++;
    }
    return read;
  }

  /** The latest few, and any recent ones, newest first. */
  private chosen(subjects: Subject[]): Subject[] {
    const since = new Date(Date.now() - RECENT_DAYS * DAY_MS)
      .toISOString()
      .slice(0, 10);
    return subjects
      .toSorted((a, b) => b.day.localeCompare(a.day))
      .filter((s, index) => index < LATEST || s.day >= since);
  }

  private ofMeeting(
    clientName: string,
    meeting: Meeting,
    summary: string | undefined,
  ): Subject[] {
    // Nothing to read until Fathom has summarised it.
    if (!summary?.trim()) return [];
    const people = meeting.attendees
      .map((a) => `${a.name} (${a.role === 'client' ? 'client' : 'MSP'})`)
      .join(', ');
    const heading = `[${HANDLE}] ${oneLine(meeting.title)} · ${meeting.occurredAt.slice(0, 10)} · ${meeting.durationMinutes} min · ${people || 'attendees unknown'}`;
    return [
      {
        id: meeting.id,
        kind: 'meeting',
        day: meeting.occurredAt.slice(0, 10),
        context: this.records(
          clientName,
          'A recorded meeting',
          heading,
          `Fathom's summary:\n${fenced(summary)}`,
        ),
        hash: hashOf('meeting', heading, summary),
        sourceId: meeting.recordingSourceId,
        note: null,
      },
    ];
  }

  private ofNotes(clientName: string, notes: MeetingNote): Subject[] {
    if (notes.clientId === null) return [];
    const filed = { ...notes, clientId: notes.clientId };
    const heading = `[${HANDLE}] ${oneLine(notes.title)} · ${notes.occurredOn}${notes.attendees.length > 0 ? ` · ${notes.attendees.join(', ')}` : ''}`;
    return [
      {
        id: notes.id,
        kind: 'note',
        day: notes.occurredOn,
        context: this.records(
          clientName,
          'Notes from a meeting, written by the MSP’s team',
          heading,
          `The notes:\n${fenced(notes.body)}`,
        ),
        hash: hashOf('note', heading, notes.body),
        sourceId: noteSource(filed, this.webUrl).id,
        note: filed,
      },
    ];
  }

  private records(
    clientName: string,
    title: string,
    heading: string,
    body: string,
  ) {
    return `<client_records>\n# ${oneLine(clientName)}\n\n## ${title}\n- ${heading}\n\n${body}\n</client_records>`;
  }

  private async read(
    workspaceId: string,
    clientId: string,
    subject: Subject,
    before: MeetingPointsRecord | undefined,
  ) {
    const runId = `run-${randomUUID()}`;
    const attemptedAt = new Date().toISOString();
    const record = {
      id: subject.id,
      subject: subject.kind,
      inputHash: subject.hash,
      runId,
      attemptedAt,
    };
    let answer: z.infer<typeof pointsSchema>;
    try {
      answer = await this.intelligence.run(workspaceId, {
        id: runId,
        kind: 'meetings',
        clientId,
        inputHash: subject.hash,
        system: DOSSIER_SYSTEM,
        context: subject.context,
        task: task(subject, attemptedAt.slice(0, 10)),
        schema: pointsSchema,
        effort: 'low',
      });
    } catch (error) {
      if (!(error instanceof IntelligenceFailure)) throw error;
      this.logger.warn(`Reading ${subject.id} failed: ${error.message}`);
      // Keep what the last good read found, and what it cites.
      await this.db.meetingPoints.save(
        workspaceId,
        clientId,
        {
          ...record,
          status: 'failed',
          planning: before?.planning ?? [],
          concerns: before?.concerns ?? [],
          askedFor: before?.askedFor ?? [],
          readAt: before?.readAt ?? null,
        },
        null,
      );
      return;
    }

    const excerpts = new Map<string, NoteSource>();
    const cited = (points: Point[]): CitedText[] =>
      points.slice(0, MAX_POINTS).flatMap((point) => {
        const text = oneLine(point.text, 300);
        const rests = point.sources.some(
          (h) => h.replace(/[[\]\s]/g, '').toUpperCase() === HANDLE,
        );
        // Uncited, or empty: not a point.
        if (!text || !rests) return [];
        const excerpt = this.excerpt(subject, point.quote);
        if (excerpt) excerpts.set(excerpt.id, excerpt);
        return [{ text, sourceIds: [excerpt?.id ?? subject.sourceId] }];
      });
    const planning = cited(answer.planning);
    const concerns = cited(answer.concerns);
    const askedFor = cited(answer.askedFor);
    await this.db.meetingPoints.save(
      workspaceId,
      clientId,
      {
        ...record,
        status: 'ok',
        planning,
        concerns,
        askedFor,
        readAt: attemptedAt,
      },
      subject.note ? [...excerpts.values()] : null,
    );
  }

  /** A source for words quoted from notes, when they really are in them. */
  private excerpt(subject: Subject, quote: string | null): NoteSource | null {
    if (!subject.note || !quote?.trim()) return null;
    const words = oneLine(quote, 300);
    if (!loosely(subject.note.body).includes(loosely(words))) return null;
    return noteSource(subject.note, this.webUrl, words);
  }
}
