import {
  themeTrendSchema,
  type ClientTheme,
  type Ticket,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DATABASE } from '../database/database.module.js';
import { DAY_MS, oneLine, stableHash } from '../integrations/ids.js';
import { IntelligenceService } from './intelligence.service.js';
import { clean, day, HandleBook } from './pack.js';
import { THEMES_SYSTEM } from './prompts.js';
import {
  executiveBrief,
  executiveOutputSchema,
  withoutHandles,
} from './styles.js';

/** What themes are asked for. Changing it looks again at every client. */
const THEMES_VERSION = 'themes-1';
/** The tickets looked at: those opened in this window. */
const WINDOW_DAYS = 90;
const MAX_THEMES = 6;
const MAX_TICKETS = 200;
/** A theme rests on at least this many tickets. */
const MIN_TICKETS = 2;
/** Looked for at most once a day, sooner only after a failure. */
const EVERY_MS = DAY_MS;
const RETRY_AFTER_MS = 60 * 60 * 1000;

const themesSchema = z.object({
  themes: z.array(
    z.object({
      title: z
        .string()
        .describe(
          'What keeps happening, in a few words, e.g. "Outlook search stops returning results".',
        ),
      summary: z
        .string()
        .describe(
          'What it is and what the tickets have in common, in a line or two.',
        ),
      trend: themeTrendSchema,
      tickets: z
        .array(z.string())
        .describe(
          'Handles of every ticket it rests on, such as "S3"; two or more.',
        ),
      executive: executiveOutputSchema.describe(
        'The same issue for the client’s leadership.',
      ),
    }),
  ),
});

function task(previous: ClientTheme[]): string {
  return [
    `Task: find the trouble that keeps coming back at this client in the last ${WINDOW_DAYS} days: the same problem, cause or system in two tickets or more. At most ${MAX_THEMES}, the most disruptive first. Fewer is better than stretching; return an empty list if nothing recurs.`,
    '',
    'For each give:',
    '- title: what keeps happening, in a few words.',
    '- summary: what it is and what the tickets have in common, with the dates that show it.',
    '- trend: new (all recent), growing (more lately), steady, or fading (less lately).',
    '- tickets: the handles of every ticket it rests on.',
    '- executive: the executive version, for the client’s owner or practice manager: what keeps disrupting their people, what it costs them in plain terms the records show, and what fixing it once would take. Nothing from internal notes.',
    ...(previous.length > 0
      ? [
          '',
          'You found these last time. Keep any that still hold, in the same words:',
          ...previous.map((t) => `- ${oneLine(t.title)}`),
        ]
      : []),
  ].join('\n');
}

/**
 * Finds recurring issues at a client: trouble in two tickets or more, from
 * what was read off its last 90 days of tickets, on the reading model, at
 * most daily. They show on the client, and recommendations and patterns
 * read them.
 */
@Injectable()
export class ThemeFinder {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly intelligence: IntelligenceService,
  ) {}

  /** Looks again when due. Returns whether the model was asked. */
  async find(
    workspaceId: string,
    clientId: string,
    { force = false } = {},
  ): Promise<boolean> {
    const preferences = await this.intelligence.preferences(workspaceId);
    if (!preferences.outputs.recurringIssues || !preferences.records.tickets) {
      return false;
    }
    if (await this.intelligence.off(workspaceId, 'reading')) return false;
    const client = await this.db.clients.get(workspaceId, clientId);
    if (!client) return false;

    const since = Date.now() - WINDOW_DAYS * DAY_MS;
    const [tickets, reads, sources, previous] = await Promise.all([
      this.db.tickets.list(workspaceId, { clientId }),
      this.db.ticketInsights.list(workspaceId, { clientId }),
      this.db.sources.listForClient(workspaceId, clientId),
      this.db.themes.list(workspaceId, { clientId }),
    ]);
    const readOf = new Map(
      reads
        .filter((r) => preferences.records.ticketNotes || !r.withInternal)
        .map((r) => [r.ticketId, r]),
    );
    const read = tickets
      .filter((t) => Date.parse(t.openedAt) >= since && readOf.has(t.id))
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
      .slice(0, MAX_TICKETS);
    if (read.length < MIN_TICKETS) {
      if (previous.length > 0) {
        await this.db.themes.replace(workspaceId, clientId, []);
      }
      return false;
    }

    const book = new HandleBook();
    const sourceById = new Map(sources.map((s) => [s.id, s]));
    const lines = read.map((t) => {
      const r = readOf.get(t.id)!;
      const cite = book.cite(
        sourceById.get(t.sourceId) ? [sourceById.get(t.sourceId)!] : [],
      );
      return `- ${cite}#${clean(t.number)} "${clean(t.subject, 160)}" · opened ${day(t.openedAt)} · ${r.category} · ${r.outcome} · issue: ${clean(r.issue, 160)} · ${clean(r.summary, 300)}`;
    });
    const alerts = new Map<string, number>();
    for (const source of sources) {
      if (
        source.kind === 'record' &&
        source.recordType === 'Alert' &&
        preferences.records.devices &&
        Date.parse(source.recordedAt) >= since
      ) {
        const title = clean(source.title, 120);
        alerts.set(title, (alerts.get(title) ?? 0) + 1);
      }
    }
    const context = [
      '<client_tickets>',
      `# ${clean(client.name)}: tickets opened in the last ${WINDOW_DAYS} days, newest first, with what Dossier read off each`,
      ...lines,
      ...(alerts.size > 0
        ? [
            '',
            `Device alerts in the last ${WINDOW_DAYS} days:`,
            ...[...alerts]
              .sort((a, b) => b[1] - a[1])
              .map(([title, n]) => `- ${title}${n > 1 ? ` (${n} times)` : ''}`),
          ]
        : []),
      '</client_tickets>',
    ].join('\n');
    const hash = stableHash(THEMES_VERSION, context);

    if (!force) {
      const last = await this.db.intelligence.lastRun(
        workspaceId,
        'themes',
        clientId,
      );
      if (last) {
        const age = Date.now() - Date.parse(last.startedAt);
        if (last.status !== 'ok' && age < RETRY_AFTER_MS) return false;
        // Nothing new to read; or issues showing, looked for within a day.
        // With none showing (never found, or cleared), look now.
        if (
          last.status === 'ok' &&
          (last.inputHash === hash || (age < EVERY_MS && previous.length > 0))
        ) {
          return false;
        }
      }
    }

    const reply = await this.intelligence.run(workspaceId, {
      kind: 'themes',
      clientId,
      inputHash: hash,
      system: THEMES_SYSTEM,
      context,
      task: task(previous),
      schema: themesSchema,
      effort: 'low',
      use: 'reading',
    });

    const bySource = new Map<string, Ticket>(read.map((t) => [t.sourceId, t]));
    const internalTexts = [...readOf.values()].flatMap((r) =>
      r.withInternal
        ? [
            r.summary,
            ...[...r.tried, r.rootCause, r.resolution]
              .filter((l) => l?.internal)
              .map((l) => l!.text),
          ]
        : [],
    );
    const createdAt = new Date().toISOString();
    const themes: ClientTheme[] = reply.themes.flatMap((found, index) => {
      const cited = [
        ...new Map(
          book
            .sources(found.tickets)
            .flatMap((s) => bySource.get(s.id) ?? [])
            .map((t) => [t.id, t] as const),
        ).values(),
      ];
      const title = oneLine(found.title, 160);
      if (!title || cited.length < MIN_TICKETS) return [];
      const opened = cited.map((t) => t.openedAt).sort();
      return [
        {
          id: `theme-${stableHash(clientId, title.toLowerCase(), index)}`,
          clientId,
          title,
          summary: oneLine(withoutHandles(found.summary), 400),
          trend: found.trend,
          ticketIds: cited.map((t) => t.id),
          sourceIds: cited.map((t) => t.sourceId),
          firstSeen: opened[0]!,
          lastSeen: opened.at(-1)!,
          executive: executiveBrief(found.executive, internalTexts),
          withInternal: cited.some((t) => readOf.get(t.id)?.withInternal),
          createdAt,
        },
      ];
    });
    await this.db.themes.replace(
      workspaceId,
      clientId,
      themes.slice(0, MAX_THEMES),
    );
    return true;
  }
}
