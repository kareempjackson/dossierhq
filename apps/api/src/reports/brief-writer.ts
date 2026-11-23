import {
  REPORT_LINE_MAX_LENGTH,
  type ReportAudience,
  type ReportLine,
  type ReportSection,
  type ReportSectionKind,
} from '@dossierhq/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { oneLine } from '../integrations/ids.js';
import {
  IntelligenceFailure,
  IntelligenceService,
  turnedOff,
} from '../intelligence/intelligence.service.js';
import { DOSSIER_SYSTEM } from '../intelligence/prompts.js';
import type { Week } from './drafter.js';

/** Shown in place of the week in brief while the model writes it. */
export const WRITING = 'Dossier is writing this…';
/** Keeps the report out of "Approve all clean" until the brief is in. */
export const WRITING_EXCEPTION = 'Dossier is still writing the week in brief';

/** How many records the brief cites, at most, as any line does. */
const CITE_LIMIT = 10;
/** Two to four sentences, with room to spare. */
const MAX_LENGTH = 900;
/** Lines in each rewritten section, at most. */
const SECTION_LIMIT = 6;

/**
 * The sections the model rewrites for leadership, below the brief, by the
 * name its answer gives each.
 */
const REWRITTEN = {
  fromYou: 'from-you',
  done: 'done',
  watching: 'watching',
  comingUp: 'coming-up',
} as const satisfies Record<string, ReportSectionKind>;
type Rewritten = (typeof REWRITTEN)[keyof typeof REWRITTEN];

const handles = z
  .array(z.string())
  .describe('The handles of every report line it rests on, such as "L3".');

const citedLines = (what: string) =>
  z
    .array(
      z.object({
        text: z.string().describe('One short line, without handles.'),
        lines: handles,
      }),
    )
    .describe(what);

const technicianSchema = z.object({
  brief: z
    .string()
    .describe(
      'Two to four short sentences for whoever looks after IT at the client, without handles in the words.',
    ),
  lines: handles,
});

const executiveSchema = z.object({
  brief: z
    .string()
    .describe(
      'Two or three short sentences for the client’s leadership, without handles in the words.',
    ),
  lines: handles,
  fromYou: citedLines(
    'What we need from you: every decision and reply the lines ask of the client.',
  ),
  done: citedLines('What we did.'),
  watching: citedLines('What we’re watching.'),
  comingUp: citedLines('Coming up.'),
});

/** Handles a model left in its words, e.g. "(L3)" or "[L3, L7]". */
const HANDLES = /\s*[[(]\s*(?:L\d+\s*,?\s*)+[\])]/g;

/** A written line, citing what the lines it rests on cite. */
export type Brief = { text: string; sourceIds: string[] };

/**
 * What the model wrote: the opening paragraph and, for leadership, the
 * sections below it in plain words. A section is left out when the model
 * wrote nothing for it, or dropped something the client is asked to do.
 */
export type Written = {
  brief: Brief;
  sections: Partial<Record<Rewritten, Brief[]>>;
};

/** What the brief writer reads: the report as drafted for its reader. */
export type Drafted = {
  clientId: string;
  title: string;
  audience: ReportAudience;
  sections: ReportSection[];
};

/**
 * The report as the model reads it: each section's lines, each line with a
 * handle. Lines that cite nothing are left out, as approving leaves them out.
 */
function context(title: string, week: Week, sections: ReportSection[]) {
  const handled: ReportLine[] = [];
  const text = sections
    .map((section) => {
      const shown = section.lines.filter(
        (line) => line.sourceIds.length > 0 && !line.pending,
      );
      if (shown.length === 0) return null;
      return [
        section.kind === 'brief'
          ? `${section.title} (put together from the counts)`
          : section.title,
        ...shown.map((line) => {
          handled.push(line);
          const asked = line.question ? `${oneLine(line.question, 300)} ` : '';
          return `- [L${handled.length}] ${asked}${oneLine(line.text, 1_000)}`;
        }),
      ].join('\n');
    })
    .filter((part): part is string => part !== null)
    .join('\n\n');
  return {
    lines: handled,
    text: `<client_records>\n${oneLine(title, 200)}, ${week.start} to ${week.end}.\n\n${text}\n</client_records>`,
  };
}

const EXECUTIVE_TASK = [
  'Task: rewrite the top of this client’s weekly report for the client’s leadership: their owner, CEO or practice manager. They are not technical, and may read nothing else. Above are the report’s own lines, by section, each with a handle such as [L4]. Write as the MSP, to the client: "we" and "your".',
  '',
  '- brief: two or three short sentences. How the week went overall, then the one or two things that matter most to their business: something we fixed that their people would notice, a risk we are watching, or anything waiting on their decision or reply.',
  '- fromYou, done, watching, comingUp: the sections What we need from you, What we did, What we’re watching and Coming up, rewritten. Use the fewest short lines that cover each, at most four. Group related things into one line, such as "We sorted out email problems for three of your staff". Leave a section empty when the lines have nothing for it.',
  '- fromYou keeps every decision and every reply the lines ask of them, with any date it is needed by.',
  '- Write in plain business words: what it means for their people and their work, and what happens if it is left. No device names or codes (say "Debbie’s laptop" or "the main file server"), ticket numbers, product versions, operating system names or error messages. No IT terms such as patch, endpoint, alert, RMM or ticket: say updates, computers, warnings and requests.',
  '- Say only what the lines say. Add no figures, names, dates or promises they don’t show. No greeting, no sign-off, and no handles in the words.',
  '- lines: for the brief, and for every line you write, the handles of the lines it rests on.',
].join('\n');

const TECHNICIAN_TASK = [
  'Task: write the Summary that opens this client’s weekly report. It is for whoever looks after IT at the client: an in-house IT lead or a technically minded manager. Above are the report’s own lines, by section, each with a handle such as [L4]. Write as the MSP, to the client: "we" and "your".',
  '',
  '- In two to four short sentences, give where things stand this week (tickets opened, closed and still open, patching, active alerts), then the few items to act on first, named as the lines name them: the device, the ticket number, the alert and its date.',
  '- Say only what the lines say. Add no figures, names or dates they don’t show. Don’t list everything, since the report does that, and don’t repeat its headings.',
  '- No greeting, no sign-off, and no handles in the words.',
  '',
  'Give:',
  '- brief: the sentences.',
  '- lines: the handles of every line it rests on.',
].join('\n');

/**
 * Writes the opening of a client's report from the report's own lines, with
 * the workspace's model, for whoever it's written for. For leadership that's
 * the week in brief and the sections below it, in plain words; for a
 * technician, a summary that names what to act on. Every line cites what the
 * lines it rests on cite. Never throws: when the model can't write it, the
 * caller keeps what was put together from the records.
 */
@Injectable()
export class BriefWriter {
  private readonly logger = new Logger(BriefWriter.name);

  constructor(private readonly intelligence: IntelligenceService) {}

  /** Why the model won't write briefs for the workspace, or null when it will. */
  async off(workspaceId: string): Promise<string | null> {
    const off = await this.intelligence.off(workspaceId);
    if (off) return off;
    return (await this.intelligence.isOn(workspaceId, 'reportQuestions'))
      ? null
      : turnedOff('reportQuestions');
  }

  /** Null when there's nothing to write from, or the model couldn't write it. */
  async write(
    workspaceId: string,
    report: Drafted,
    week: Week,
    today: string,
  ): Promise<Written | null> {
    const read = context(report.title, week, report.sections);
    if (read.lines.length === 0) return null;
    /** The records a line cites, through the handles of what it rests on. */
    const cites = (list: string[]) =>
      [
        ...new Set(
          list.flatMap((handle) => {
            const line = read.lines[Number(handle.replace(/\D/g, '')) - 1];
            return line?.sourceIds ?? [];
          }),
        ),
      ].slice(0, CITE_LIMIT);
    const words = (text: string, length: number) =>
      oneLine(text.replace(HANDLES, ''), length);
    const preamble = `Today is ${today}. This weekly report covers ${week.start} to ${week.end}.\n\n`;
    try {
      const request = {
        kind: 'reports' as const,
        clientId: report.clientId,
        system: DOSSIER_SYSTEM,
        context: read.text,
        // The other audience's version reads the same records.
        sharedContext: true,
        effort: 'low' as const,
      };
      // A technician's summary is all the model writes for them.
      const reply: z.infer<typeof executiveSchema> =
        report.audience === 'executive'
          ? await this.intelligence.run(workspaceId, {
              ...request,
              task: preamble + EXECUTIVE_TASK,
              schema: executiveSchema,
            })
          : {
              ...(await this.intelligence.run(workspaceId, {
                ...request,
                task: preamble + TECHNICIAN_TASK,
                schema: technicianSchema,
              })),
              fromYou: [],
              done: [],
              watching: [],
              comingUp: [],
            };
      const text = words(reply.brief, MAX_LENGTH);
      const sourceIds = cites(reply.lines);
      // A brief that rests on nothing would be left out on approval.
      if (!text || sourceIds.length === 0) return null;

      const sections: Written['sections'] = {};
      for (const [key, kind] of Object.entries(REWRITTEN)) {
        const written = reply[key as keyof typeof REWRITTEN]
          .map((line) => ({
            text: words(line.text, REPORT_LINE_MAX_LENGTH),
            sourceIds: cites(line.lines),
          }))
          .filter((line) => line.text && line.sourceIds.length > 0)
          .slice(0, SECTION_LIMIT);
        if (written.length === 0) continue;
        // Everything the client is asked to do stays in, or the rules' does.
        if (kind === 'from-you') {
          const kept = new Set(written.flatMap((line) => line.sourceIds));
          const asked = report.sections
            .find((section) => section.kind === kind)
            ?.lines.flatMap((line) => line.sourceIds);
          if (asked?.some((id) => !kept.has(id))) continue;
        }
        sections[kind] = written;
      }
      return { brief: { text, sourceIds }, sections };
    } catch (error) {
      if (!(error instanceof IntelligenceFailure)) {
        this.logger.error(
          `Writing the opening of ${report.clientId}’s report failed`,
          (error as Error)?.stack,
        );
      }
      return null;
    }
  }
}
