import type { Source } from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import {
  clean,
  day,
  recordOf,
  type HandleBook,
  type SharedRecords,
} from './pack.js';

/** What search_records can look through. */
export const SEARCH_KINDS = [
  'attention',
  'promises',
  'meetings',
  'recommendations',
  'tickets',
  'devices',
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

/** The most lines one search returns. */
const MAX_RESULTS = 40;
/** How many of the best matches are checked against what Claude may read. */
const CANDIDATES = 120;

/** Words that say nothing about which records are meant. */
const STOP_WORDS = new Set(
  'a an and any are at be by client clients do does for from has have how in is it of on or our the their them they this to was were what when which who why with'.split(
    ' ',
  ),
);

type Entry = {
  kind: SearchKind;
  clientId: string;
  /** The line as the model reads it, after its handles. */
  line: string;
  /** What the words are matched against: names and text, never dates. */
  words: string;
  sourceIds: string[];
};

/** A query's words, lowercased, without repeats or words that say nothing. */
function termsOf(query: string): string[] {
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word));
  return [...new Set(words)];
}

/** How many terms start a word in `words`, plus one for the whole phrase. */
function scoreOf(words: string, terms: string[]): number {
  const found = terms.filter((term) =>
    new RegExp(`(^|[^\\p{L}\\p{N}])${term}`, 'u').test(words),
  ).length;
  return found + (terms.length > 1 && words.includes(terms.join(' ')) ? 1 : 0);
}

/**
 * Every client's records as lines to search, loaded once per question. A
 * line is shown only when Claude may read every record it cites, as packs
 * do, and carries handles from the question's book.
 */
export class RecordSearch {
  private constructor(
    private readonly db: DatabaseAdapter,
    private readonly workspaceId: string,
    private readonly shared: SharedRecords,
    private readonly entries: Entry[],
    private readonly ticketSources: Set<string>,
  ) {}

  static async load(
    db: DatabaseAdapter,
    workspaceId: string,
    shared: SharedRecords,
  ): Promise<RecordSearch> {
    const [
      clients,
      attention,
      commitments,
      meetings,
      recommendations,
      tickets,
      devices,
    ] = await Promise.all([
      db.clients.list(workspaceId),
      db.attention.list(workspaceId),
      db.commitments.list(workspaceId),
      shared.meetings ? db.meetings.list(workspaceId) : [],
      db.recommendations.list(workspaceId),
      db.tickets.list(workspaceId),
      shared.devices ? db.devices.list(workspaceId) : [],
    ]);
    const names = new Map(clients.map((c) => [c.id, c.name]));
    const entry = (
      kind: SearchKind,
      clientId: string | null,
      line: string,
      words: string,
      sourceIds: string[],
    ): Entry[] =>
      // Workspace-wide items belong to no client, so no client's search.
      clientId !== null && names.has(clientId)
        ? [
            {
              kind,
              clientId,
              line: `${clean(names.get(clientId)!)}: ${line}`,
              words: `${names.get(clientId)} ${words}`.toLowerCase(),
              sourceIds,
            },
          ]
        : [];

    const entries: Entry[] = [
      ...attention.flatMap((a) =>
        entry(
          'attention',
          a.clientId,
          `${a.urgency} ${a.kind}: ${clean(a.title)} (raised ${day(a.raisedAt)})`,
          `${a.urgency} ${a.kind} ${a.title}`,
          a.sourceIds,
        ),
      ),
      ...commitments.flatMap((c) =>
        entry(
          'promises',
          c.clientId,
          `promised "${clean(c.statement)}" on ${day(c.madeAt)}` +
            (c.dueOn ? `, due ${c.dueOn}` : '') +
            (c.status === 'done' ? ', done' : ', still open'),
          `promise ${c.statement}`,
          c.sourceIds,
        ),
      ),
      ...meetings.flatMap((m) =>
        (
          [
            ['planning', m.planning],
            ['concern', m.concerns],
            ['asked for', m.askedFor],
          ] as const
        ).flatMap(([label, points]) =>
          points.flatMap((point) =>
            entry(
              'meetings',
              m.clientId,
              `${label} in "${clean(m.title)}" on ${day(m.occurredAt)}: ${clean(point.text)}`,
              `meeting ${label} ${m.title} ${point.text}`,
              point.sourceIds,
            ),
          ),
        ),
      ),
      ...recommendations.flatMap((r) =>
        entry(
          'recommendations',
          r.clientId,
          `recommendation (${r.status}): ${clean(r.title)}. ${clean(r.reason, 300)}`,
          `recommendation ${r.title} ${r.reason}`,
          r.sourceIds,
        ),
      ),
      ...(shared.tickets ? tickets : []).flatMap((t) =>
        entry(
          'tickets',
          t.clientId,
          `ticket #${clean(t.number)} "${clean(t.subject, 200)}" · ${clean(t.status)} · ${t.urgency} · opened ${day(t.openedAt)}, updated ${day(t.updatedAt)}`,
          `ticket ${t.number} ${t.subject} ${t.status} ${t.requester ?? ''} ${t.assignedTo ?? ''}`,
          [t.sourceId],
        ),
      ),
      ...devices.flatMap((d) =>
        entry(
          'devices',
          d.clientId,
          `${clean(d.name)} (${d.type}, ${clean(d.os)}${d.assignedTo ? `, used by ${clean(d.assignedTo)}` : ''}) · patching ${d.patchStatus} · last seen ${day(d.lastSeenAt)}`,
          `device ${d.name} ${d.type} ${d.os} ${d.assignedTo ?? ''} patching ${d.patchStatus}`,
          [d.sourceId],
        ),
      ),
    ];
    return new RecordSearch(
      db,
      workspaceId,
      shared,
      entries,
      new Set(tickets.map((t) => t.sourceId)),
    );
  }

  /** The best matches for `query`, as text with handles from `book`. */
  async find(
    query: string,
    kinds: SearchKind[],
    book: HandleBook,
  ): Promise<string> {
    const terms = termsOf(query);
    if (terms.length === 0) {
      return 'Search for a word or two that names what you’re looking for, such as "backup" or "Windows 10".';
    }
    const wanted = new Set<SearchKind>(kinds.length > 0 ? kinds : SEARCH_KINDS);
    // Stable, so equal scores keep each repository's order: most urgent first.
    const matches = this.entries
      .filter((e) => wanted.has(e.kind))
      .map((e) => ({ e, score: scoreOf(e.words, terms) }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((m) => m.e);

    const candidates = matches.slice(0, CANDIDATES);
    const known = new Map(
      (
        await this.db.sources.getMany(this.workspaceId, [
          ...new Set(candidates.flatMap((e) => e.sourceIds)),
        ])
      ).map((s) => [s.id, s]),
    );
    const readable = (s: Source) =>
      this.shared[recordOf(s, this.ticketSources)];
    const lines = candidates.flatMap((e) => {
      const sources = e.sourceIds.flatMap((id) => known.get(id) ?? []);
      // Nothing to cite, or it rests on something kept from Claude.
      if (sources.length === 0 || !sources.every(readable)) return [];
      return [`- ${book.cite(sources)}${e.line}`];
    });
    const shown = lines.slice(0, MAX_RESULTS);
    const what = `"${clean(query, 100)}" in ${[...wanted].join(', ')}`;
    if (shown.length === 0) {
      return `<search_results>\nNothing matches ${what}. Try other words, or fewer.\n</search_results>`;
    }
    const more =
      matches.length - candidates.length + lines.length - shown.length;
    return [
      '<search_results>',
      `Matches for ${what}, best first:`,
      ...shown,
      ...(more > 0
        ? [`- (+${more} more; add words to narrow the search)`]
        : []),
      '</search_results>',
    ].join('\n');
  }
}
