import type {
  Report,
  ReportEdit,
  ReportLine,
  ReportQuestion,
  ReportStatus,
  ReportSummary,
  Source,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Clock } from '../common/clock.js';
import { notFound } from '../common/not-found.js';
import { DATABASE } from '../database/database.module.js';
import { draftReport, localDate, weekOf, type Week } from './drafter.js';
import {
  ANSWERING_EXCEPTION,
  pendingLines,
  QuestionAnswerer,
} from './question-answerer.js';

/** How many sources one read asks for, to keep requests short. */
const SOURCE_BATCH = 50;
/** How many clients' questions go to the model at once. */
const ANSWER_CONCURRENCY = 3;

const lines = (report: Report) =>
  report.sections.flatMap((section) => section.lines);

/** "1 of these reports has", "3 of these reports have". */
const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const toSummary = ({
  title: _title,
  glance: _glance,
  sections: _sections,
  sources: _sources,
  ...summary
}: Report): ReportSummary => summary;

/** A drafted report whose questions are still to answer. */
type Answering = {
  report: Report;
  questions: ReportQuestion[];
  /** The questions section as saved, which the answers replace. */
  lines: ReportLine[];
};

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  /** Each workspace's answering still under way. */
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly clock: Clock,
    private readonly answerer: QuestionAnswerer,
  ) {}

  /** Drafts waiting for review: those with exceptions first, then clean ones. */
  async queue(workspaceId: string): Promise<ReportSummary[]> {
    const drafts = await this.db.reports.listSummaries(workspaceId, {
      status: 'draft',
    });
    return [
      ...drafts.filter((report) => report.exceptions.length > 0),
      ...drafts.filter((report) => report.exceptions.length === 0),
    ];
  }

  /**
   * Drafts this week's report now, from what the tools last synced, for one
   * client or for every client. A draft for the week is replaced and keeps
   * its ID. An approved report stays as it went out: for one client that's a
   * 409. Drafting every client also leaves the ones someone chose to skip,
   * and drafts someone edited. Returns the reports drafted, by client name.
   *
   * Saved questions are answered afterwards, a few clients at a time, so this
   * returns at once: until then each one says Dossier is answering it, and
   * the report has an exception that keeps it out of "Approve all clean".
   */
  async draft(
    workspaceId: string,
    clientId?: string,
  ): Promise<ReportSummary[]> {
    const workspace =
      (await this.db.workspaces.get(workspaceId)) ?? notFound('Workspace');
    const clients =
      clientId === undefined
        ? await this.db.clients.list(workspaceId)
        : [
            (await this.db.clients.get(workspaceId, clientId)) ??
              notFound('Client', clientId),
          ];
    const now = this.clock.now();
    const week = weekOf(now, workspace.timeZone);
    const filter = clientId === undefined ? {} : { clientId };

    const thisWeek = new Map(
      (await this.db.reports.listSummaries(workspaceId, filter))
        .filter((report) => report.weekStart === week.start)
        .map((report) => [report.clientId, report]),
    );
    if (
      clientId !== undefined &&
      thisWeek.get(clientId)?.status === 'approved'
    ) {
      throw new ConflictException(
        `This week’s report for ${clients[0]!.name} is already approved, so Dossier kept it as it went out.`,
      );
    }

    const [
      devices,
      tickets,
      attention,
      commitments,
      meetings,
      recommendations,
      links,
      questions,
    ] = await Promise.all([
      this.db.devices.list(workspaceId, filter),
      this.db.tickets.list(workspaceId, filter),
      // Unfiltered, for the workspace-wide items too.
      this.db.attention.list(workspaceId),
      this.db.commitments.list(workspaceId, filter),
      this.db.meetings.list(workspaceId, filter),
      this.db.recommendations.list(workspaceId, {
        ...filter,
        status: 'accepted',
      }),
      this.db.clients.links(workspaceId),
      // With a client, theirs and everyone's; without, all of them.
      this.db.reportQuestions.list(workspaceId, filter),
    ]);
    const workspaceAttention = attention.filter(
      (item) => item.clientId === null,
    );

    const drafted: ReportSummary[] = [];
    const answering: Answering[] = [];
    for (const client of clients) {
      const existing = thisWeek.get(client.id);
      if (
        existing?.status === 'approved' ||
        (clientId === undefined &&
          (existing?.status === 'skipped' || existing?.editedAt))
      ) {
        continue;
      }
      const of = <T extends { clientId: string | null }>(items: T[]) =>
        items.filter((item) => item.clientId === client.id);
      const report = draftReport({
        id: existing?.id ?? `${client.id}-${week.start}`,
        client,
        week,
        now,
        timeZone: workspace.timeZone,
        devices: of(devices),
        tickets: of(tickets),
        attention: of(attention),
        workspaceAttention,
        commitments: of(commitments),
        meetings: of(meetings),
        recommendations: of(recommendations),
        links,
      });
      const asked = questions.filter(
        (q) => q.clientId === null || q.clientId === client.id,
      );
      if (asked.length > 0) {
        // A fresh token per draft, so late answers can't land on a redraft.
        const lines = pendingLines(asked, randomUUID().slice(0, 8));
        report.sections = report.sections.map((section) =>
          section.kind === 'questions' ? { ...section, lines } : section,
        );
        report.exceptions = [...report.exceptions, ANSWERING_EXCEPTION];
        answering.push({ report, questions: asked, lines });
      }
      report.sources = await this.citedSources(workspaceId, report);
      await this.db.reports.save(workspaceId, report);
      drafted.push(toSummary(report));
    }
    this.answerLater(
      workspaceId,
      answering,
      week,
      localDate(now, workspace.timeZone),
    );
    return drafted;
  }

  /** Resolves once every report drafted so far has its answers. */
  async answered(workspaceId: string): Promise<void> {
    await this.inFlight.get(workspaceId);
  }

  /**
   * Approve, skip, or put back to draft; unknown IDs are skipped. Approving
   * stamps the time and drops lines with no source, so what's approved is
   * what goes out. Approving in bulk leaves no room to read them, so it's
   * refused (422) if any has exceptions: those are approved one at a time,
   * once someone has read them (`reviewed`). A report that's still being
   * answered, or already sent, can't change (409).
   */
  async setStatus(
    workspaceId: string,
    ids: string[],
    status: ReportStatus,
    reviewed = false,
  ): Promise<ReportSummary[]> {
    const wanted = new Set(ids);
    const found = (await this.db.reports.listSummaries(workspaceId)).filter(
      (report) => wanted.has(report.id),
    );
    const sent = found.filter((report) => report.sentAt !== null);
    if (sent.length > 0) {
      throw new ConflictException({
        message:
          ids.length === 1
            ? 'This report has gone to the client, so it stays as it went out.'
            : `${plural(sent.length, 'of these reports has', 'of these reports have')} already gone to the client, and can’t change.`,
        ids: sent.map((report) => report.id),
      });
    }
    if (status !== 'approved') {
      return this.db.reports.setStatus(
        workspaceId,
        ids,
        status,
        this.clock.now(),
      );
    }

    const flagged = found.filter((report) => report.exceptions.length > 0);
    if (!reviewed && flagged.length > 0) {
      throw new UnprocessableEntityException({
        message: `${plural(flagged.length, 'of these reports has', 'of these reports have')} something to check first. Open ${flagged.length === 1 ? 'it' : 'each one'} and approve it there.`,
        ids: flagged.map((report) => report.id),
      });
    }
    const now = this.clock.now();
    const approved: ReportSummary[] = [];
    for (const summary of found) {
      const report = await this.db.reports.get(workspaceId, summary.id);
      if (!report) continue;
      if (lines(report).some((line) => line.pending)) {
        throw new ConflictException(
          'Dossier is still answering the questions in this report. Approve it once the answers are in.',
        );
      }
      const outgoing: Report = {
        ...report,
        status: 'approved',
        approvedAt: now,
        sections: report.sections.map((section) => ({
          ...section,
          lines: section.lines.filter((line) => line.sourceIds.length > 0),
        })),
      };
      await this.db.reports.save(workspaceId, outgoing);
      approved.push(toSummary(outgoing));
    }
    const order = new Map(ids.map((id, index) => [id, index]));
    return approved.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  }

  async setOneStatus(
    workspaceId: string,
    id: string,
    status: ReportStatus,
  ): Promise<ReportSummary> {
    const [updated] = await this.setStatus(workspaceId, [id], status, true);
    return updated ?? notFound('Report', id);
  }

  /**
   * Rewords some of a draft's lines and takes others out. Each line keeps
   * its sources, and the wording Dossier drafted, until it's put back as it
   * was. Only drafts change: approved, skipped and sent reports are a 409,
   * as are lines Dossier is still answering or that a redraft replaced.
   */
  async edit(
    workspaceId: string,
    id: string,
    { lines: changes = [], remove = [] }: ReportEdit,
  ): Promise<Report> {
    const report =
      (await this.db.reports.get(workspaceId, id)) ?? notFound('Report', id);
    if (report.status !== 'draft') {
      throw new ConflictException(
        report.sentAt
          ? 'This report has gone to the client, so it stays as it went out.'
          : `This report is ${report.status}. Put it back to draft to change it.`,
      );
    }
    const byId = new Map(lines(report).map((line) => [line.id, line]));
    for (const lineId of [...changes.map((c) => c.id), ...remove]) {
      const line = byId.get(lineId);
      if (!line) {
        throw new ConflictException(
          'That line isn’t in this report any more; it was probably redrafted. Reload it and try again.',
        );
      }
      if (line.pending) {
        throw new ConflictException(
          'Dossier is still answering that question. Change it once the answer is in.',
        );
      }
    }

    const wording = new Map(changes.map((c) => [c.id, c.text]));
    const removed = new Set(remove);
    const edited: Report = {
      ...report,
      editedAt: this.clock.now(),
      sections: report.sections.map((section) => ({
        ...section,
        lines: section.lines
          .filter((line) => !removed.has(line.id))
          .map((line) => {
            const text = wording.get(line.id);
            if (text === undefined) return line;
            const { original: drafted = line.text, ...rest } = line;
            return text === drafted
              ? { ...rest, text }
              : { ...rest, text, original: drafted };
          }),
      })),
    };
    await this.db.reports.save(workspaceId, edited);
    return edited;
  }

  /** Answers the reports' questions in the background, a few at a time. */
  private answerLater(
    workspaceId: string,
    jobs: Answering[],
    week: Week,
    today: string,
  ) {
    if (jobs.length === 0) return;
    const queue = [...jobs];
    const worker = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        await this.answer(workspaceId, job, week, today).catch(
          (error: unknown) =>
            this.logger.error(
              `Saving answers for ${job.report.id} failed`,
              (error as Error)?.stack,
            ),
        );
      }
    };
    const run = Promise.all([
      this.inFlight.get(workspaceId),
      ...Array.from(
        { length: Math.min(ANSWER_CONCURRENCY, jobs.length) },
        worker,
      ),
    ]).then(() => {});
    this.inFlight.set(workspaceId, run);
    void run.finally(() => {
      if (this.inFlight.get(workspaceId) === run) {
        this.inFlight.delete(workspaceId);
      }
    });
  }

  /** Puts one report's answers in place, unless it changed in the meantime. */
  private async answer(
    workspaceId: string,
    { report, questions, lines }: Answering,
    week: Week,
    today: string,
  ) {
    const answers = await this.answerer.answer(
      workspaceId,
      report.clientId,
      questions,
      lines,
      week,
      today,
    );
    const current = await this.db.reports.get(workspaceId, report.id);
    const section = current?.sections.find((s) => s.kind === 'questions');
    // Approved, skipped or redrafted while the model worked: leave it be.
    if (
      !current ||
      current.status !== 'draft' ||
      section?.lines[0]?.id !== lines[0]?.id
    ) {
      return;
    }
    const updated: Report = {
      ...current,
      exceptions: [
        ...new Set([
          ...current.exceptions.filter((e) => e !== ANSWERING_EXCEPTION),
          ...answers.exceptions,
        ]),
      ],
      sections: current.sections.map((s) =>
        s.kind === 'questions' ? { ...s, lines: answers.lines } : s,
      ),
    };
    updated.sources = await this.citedSources(workspaceId, updated);
    await this.db.reports.save(workspaceId, updated);
  }

  /**
   * Everything the report cites, in the order it first cites them: its own
   * counts, and the records as they are now, for the report to keep.
   */
  private async citedSources(
    workspaceId: string,
    report: Report,
  ): Promise<Source[]> {
    const order = [
      ...new Set(
        report.sections.flatMap((section) =>
          section.lines.flatMap((line) => line.sourceIds),
        ),
      ),
    ];
    const own = new Map(report.sources.map((source) => [source.id, source]));
    const wanted = order.filter((id) => !own.has(id));
    const found = new Map<string, Source>();
    for (let i = 0; i < wanted.length; i += SOURCE_BATCH) {
      const batch = wanted.slice(i, i + SOURCE_BATCH);
      for (const source of await this.db.sources.getMany(workspaceId, batch)) {
        found.set(source.id, source);
      }
    }
    return order.flatMap((id) => {
      const source = own.get(id) ?? found.get(id);
      return source ? [source] : [];
    });
  }
}
