'use client';

import {
  REPORT_LINE_MAX_LENGTH,
  SUMMARY_FIELD,
  sourceOrigin,
  weeklyTimeLabel,
  type Report,
  type ReportDeliveryStatus,
  type ReportEdit,
  type ReportLine,
  type ReportStatus,
  type Source,
} from '@dossierhq/contracts';
import {
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Copy,
  ExternalLink,
  Pencil,
  Send,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { setReportStatus } from '@/app/actions';
import { editReport, sendReport } from '@/app/report-actions';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button, ButtonLink } from '@/components/ui/button';
import { ConnectorTile } from '@/components/ui/connector-tile';
import { Markdown } from '@/components/ui/markdown';
import { Sheet } from '@/components/ui/sheet';
import { SourceChip } from '@/components/ui/source-chip';
import { StatusDot } from '@/components/ui/status-dot';
import { cn } from '@/lib/cn';
import { formatTimestamp } from '@/lib/format';
import { sourceName } from '@/lib/sources';
import { EmailPreview } from './email-preview';

export type NumberedSource = Source & { number: number };

export type ReportNav = {
  position: number;
  total: number;
  /** "with exceptions" or "clean", for screen readers. */
  group: string;
  prevHref: string | null;
  nextHref: string | null;
};

type Selection = { sourceId: string; lineId?: string };

type ReportEditorProps = {
  report: Report;
  client: { id: string; name: string };
  weekLabel: string;
  /** Preformatted mono line: week, dates, drafted time, recipient. */
  meta: string;
  sources: NumberedSource[];
  nav: ReportNav | null;
  /** For reports approved before this visit, e.g. "Approved 2 Oct 2026, 16:05". */
  approvedLabel: string | null;
  /** Who it goes to and when; null when that couldn't be read. */
  delivery: ReportDeliveryStatus | null;
  timeZone: string;
};

/**
 * The report on one sheet, its sources on another. Selecting a citation
 * highlights the line and opens the record. A draft's lines can be reworded
 * or taken out; approving leaves out lines with no source, and only an
 * approved report can be copied or sent. Once sent, it stays as it went.
 */
export function ReportEditor({
  report,
  client,
  weekLabel,
  meta,
  sources,
  nav,
  approvedLabel,
  delivery,
  timeZone,
}: ReportEditorProps) {
  const [selected, setSelected] = useState<Selection | null>(null);
  // Shows the new status at once; falls back if the save fails.
  const [status, setOptimisticStatus] = useOptimistic(report.status);
  const [pending, startTransition] = useTransition();
  // Undo and "Next report" are offered for decisions made on this visit only.
  const [decidedHere, setDecidedHere] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const sourceById = useMemo(
    () => new Map(sources.map((source) => [source.id, source])),
    [sources],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function select(sourceId: string, lineId?: string) {
    setSelected((current) =>
      current?.sourceId === sourceId && current.lineId === lineId
        ? null
        : { sourceId, lineId },
    );
  }

  const lineIsCited = (line: ReportLine) =>
    selected !== null &&
    line.sourceIds.includes(selected.sourceId) &&
    (selected.lineId === undefined || selected.lineId === line.id);

  const unsourced = report.sections.flatMap((section) =>
    section.lines.filter(
      (line) => line.sourceIds.length === 0 && !line.pending,
    ),
  ).length;
  // Saved questions still being answered; the page looks again until they're in.
  const answering = report.sections.flatMap((section) =>
    section.lines.filter((line) => line.pending),
  ).length;
  const router = useRouter();
  useEffect(() => {
    // Answers take seconds; a draft still waiting after 10 minutes never got them.
    const recent = Date.now() - Date.parse(report.generatedAt) < 10 * 60_000;
    if (answering === 0 || !recent) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [answering, report.generatedAt, router]);
  const draft = status === 'draft';
  const sent = report.sentAt !== null;

  /** Saves a change to the lines; false when it didn't save. */
  async function edit(change: ReportEdit): Promise<boolean> {
    setError(null);
    const result = await editReport(report.id, change);
    if (!result.ok) setError(result.error);
    return result.ok;
  }

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await sendReport(report.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAnnouncement(`Report sent to ${client.name}.`);
    });
  }

  async function copy() {
    const text = [
      report.title,
      meta,
      '',
      ...report.sections.flatMap((section) => {
        const lines = section.lines.filter((line) => line.sourceIds.length > 0);
        return lines.length > 0
          ? [
              section.title,
              ...lines.map((line) =>
                line.question
                  ? `- ${line.question}\n  ${line.text}`
                  : `- ${line.text}`,
              ),
              '',
            ]
          : [];
      }),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setAnnouncement(
        'Report copied to the clipboard, without unsourced lines.',
      );
    } catch {
      setAnnouncement('Copy failed. Your browser blocked clipboard access.');
    }
  }

  function decide(next: ReportStatus) {
    setSelected(null);
    setError(null);
    startTransition(async () => {
      setOptimisticStatus(next);
      const result = await setReportStatus(report.id, next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDecidedHere(next !== 'draft');
      setAnnouncement(
        next === 'approved'
          ? 'Report approved.'
          : next === 'skipped'
            ? 'Report skipped this week.'
            : 'Back to draft.',
      );
    });
  }

  return (
    <>
      <Sheet
        as="article"
        scroll="xl"
        aria-labelledby="report-title"
        className="min-w-0 flex-1 px-5 pt-6 pb-6 sm:px-10"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Breadcrumb
            items={[
              { label: 'Reports', href: '/reports' },
              { label: client.name, href: `/clients/${client.id}` },
              { label: weekLabel },
            ]}
          />
          {nav && <QueueNav nav={nav} />}
        </div>

        <div className="mx-auto mt-10 max-w-180">
          {report.exceptions.length > 0 && draft && (
            <div className="mb-8 rounded-tile bg-surface px-4 py-3">
              <p className="text-meta font-medium text-ink">
                Check before approving
              </p>
              <ul className="mt-1 list-disc pl-4 text-meta text-text">
                {report.exceptions.map((exception) => (
                  <li key={exception}>{exception}</li>
                ))}
              </ul>
            </div>
          )}

          <h1 id="report-title" className="text-title-compact sm:text-title">
            {report.title}
          </h1>
          <p className="mt-3 font-mono text-mono text-muted">{meta}</p>

          <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-tile bg-hairline sm:grid-cols-4">
            {report.glance.map((item) => (
              <div key={item.label} className="bg-surface-soft px-4 py-3">
                <dt className="text-meta-sm text-muted">{item.label}</dt>
                <dd className="mt-1 text-figure text-ink">{item.value}</dd>
                {item.note && (
                  <dd className="text-meta-sm text-muted">{item.note}</dd>
                )}
              </div>
            ))}
          </dl>

          <div className="mt-10 border-t border-hairline">
            {report.sections.map((section) => {
              const lines =
                status === 'approved'
                  ? section.lines.filter((line) => line.sourceIds.length > 0)
                  : section.lines;
              return (
                <section
                  key={section.kind}
                  aria-labelledby={`section-${section.kind}`}
                  className="grid gap-2 border-b border-hairline py-6 sm:grid-cols-[148px_minmax(0,1fr)] sm:gap-8"
                >
                  <h2
                    id={`section-${section.kind}`}
                    className="text-meta font-normal text-muted sm:pt-1"
                  >
                    {section.title}
                  </h2>
                  <div className="flex min-w-0 flex-col gap-3">
                    {lines.length === 0 ? (
                      <p className="text-report text-muted">
                        Nothing this week.
                      </p>
                    ) : (
                      lines.map((line) => (
                        <Line
                          key={line.id}
                          line={line}
                          cited={lineIsCited(line)}
                          selected={selected}
                          sourceById={sourceById}
                          onSelect={select}
                          onClose={() => setSelected(null)}
                          onEdit={
                            draft && !pending && !line.pending ? edit : null
                          }
                        />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          <div className="sticky bottom-4 z-10 mx-auto mt-12 flex w-fit max-w-full flex-wrap items-center justify-center gap-1 rounded-full bg-sheet p-1.5 shadow-float">
            <span className="flex items-center gap-1.5 px-3 text-meta text-text">
              <StatusDot
                tone={
                  status === 'approved'
                    ? 'positive'
                    : status === 'draft' && report.exceptions.length > 0
                      ? 'strong'
                      : 'neutral'
                }
                decorative
              />
              {status === 'approved' ? (
                sent ? (
                  `Sent ${formatTimestamp(report.sentAt!, timeZone)}`
                ) : (
                  (approvedLabel ?? 'Approved')
                )
              ) : status === 'skipped' ? (
                'Skipped this week'
              ) : (
                <>
                  <span className="sr-only sm:not-sr-only">Draft · </span>
                  {report.exceptions.length > 0
                    ? `${report.exceptions.length} to check`
                    : 'clean'}
                </>
              )}
            </span>
            {draft && (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => decide('skipped')}
              >
                Skip
              </Button>
            )}
            <EmailPreview reportId={report.id} />
            {status === 'approved' && (
              <Button variant="ghost" onClick={copy} className="max-sm:px-3">
                <Copy aria-hidden />
                <span className="sr-only sm:not-sr-only">Copy</span>
              </Button>
            )}
            {draft ? (
              <Button
                variant="primary"
                disabled={pending}
                onClick={() => decide('approved')}
              >
                {pending ? 'Saving…' : 'Approve'}
              </Button>
            ) : (
              <>
                {decidedHere && !sent && (
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => decide('draft')}
                  >
                    Undo
                  </Button>
                )}
                {status === 'approved' && !sent && (
                  <Button
                    variant="primary"
                    disabled={pending || !delivery?.to.length}
                    onClick={send}
                  >
                    <Send aria-hidden />
                    {pending ? 'Sending…' : 'Send now'}
                  </Button>
                )}
                {decidedHere && nav?.nextHref && (
                  <ButtonLink href={nav.nextHref}>Next report</ButtonLink>
                )}
              </>
            )}
          </div>
          {delivery && (
            <DeliveryNote
              delivery={delivery}
              status={status}
              sent={sent}
              client={client}
              timeZone={timeZone}
            />
          )}
          {draft && answering > 0 && (
            <p role="status" className="mt-3 text-center text-meta text-muted">
              {answering === 1
                ? 'Dossier is answering your question from the client’s records. This page updates when the answer is in.'
                : `Dossier is answering your ${answering} questions from the client’s records. This page updates when the answers are in.`}
            </p>
          )}
          {draft && unsourced > 0 && (
            <p className="mt-3 text-center text-meta text-muted">
              {unsourced === 1
                ? '1 line has no source and will be left out.'
                : `${unsourced} lines have no source and will be left out.`}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-center text-meta text-alert">
              {error}
            </p>
          )}
          <p role="status" className="sr-only">
            {announcement}
          </p>
        </div>
      </Sheet>

      <Sheet
        as="aside"
        aria-labelledby="sources-heading"
        scroll="xl"
        className="p-4 sm:p-5 xl:w-90 xl:shrink-0"
      >
        <SourcesPanel
          sources={sources}
          selectedId={selected?.sourceId ?? null}
          onSelect={(id) => select(id)}
          onClose={() => setSelected(null)}
        />
      </Sheet>
    </>
  );
}

function QueueNav({ nav }: { nav: ReportNav }) {
  const arrow =
    'grid size-8 place-items-center rounded-full text-muted transition-colors';
  return (
    <nav aria-label="Report queue" className="flex items-center gap-1">
      {nav.prevHref ? (
        <Link
          href={nav.prevHref}
          aria-label="Previous report"
          className={cn(arrow, 'hover:bg-surface hover:text-ink')}
        >
          <ChevronLeft aria-hidden className="size-4" />
        </Link>
      ) : (
        <span aria-hidden className={cn(arrow, 'opacity-40')}>
          <ChevronLeft className="size-4" />
        </span>
      )}
      <span className="px-1 font-mono text-mono text-muted">
        <span aria-hidden>
          {nav.position} / {nav.total}
        </span>
        <span className="sr-only">
          Report {nav.position} of {nav.total} {nav.group}
        </span>
      </span>
      {nav.nextHref ? (
        <Link
          href={nav.nextHref}
          aria-label="Next report"
          className={cn(arrow, 'hover:bg-surface hover:text-ink')}
        >
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      ) : (
        <span aria-hidden className={cn(arrow, 'opacity-40')}>
          <ChevronRight className="size-4" />
        </span>
      )}
    </nav>
  );
}

function Line({
  line,
  cited,
  selected,
  sourceById,
  onSelect,
  onClose,
  onEdit,
}: {
  line: ReportLine;
  cited: boolean;
  selected: Selection | null;
  sourceById: Map<string, NumberedSource>;
  onSelect: (sourceId: string, lineId: string) => void;
  onClose: () => void;
  /** Saves a change to the lines; null when this line can't change. */
  onEdit: ((change: ReportEdit) => Promise<boolean>) | null;
}) {
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [text, setText] = useState(line.text);
  const [saving, setSaving] = useState(false);
  const fieldId = useId();
  const inline =
    selected?.lineId === line.id
      ? sourceById.get(selected.sourceId)
      : undefined;

  async function save(change: ReportEdit) {
    if (!onEdit) return;
    setSaving(true);
    const saved = await onEdit(change);
    setSaving(false);
    if (saved) {
      setEditing(false);
      setRemoving(false);
    }
  }

  if (editing && onEdit) {
    const reworded = text.trim();
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save({ lines: [{ id: line.id, text: reworded }] });
        }}
      >
        {line.question && (
          <p className="mb-1 text-meta font-medium text-ink">{line.question}</p>
        )}
        <label htmlFor={fieldId} className="sr-only">
          Line
        </label>
        <textarea
          id={fieldId}
          value={text}
          rows={3}
          maxLength={REPORT_LINE_MAX_LENGTH}
          // Opened by pressing Edit, so the field is where they're going.
          autoFocus
          onChange={(event) => setText(event.target.value)}
          className="w-full resize-y rounded-input bg-surface px-3 py-2 text-report text-ink"
        />
        <p className="mt-1 text-meta text-muted">
          The line keeps its sources whatever it says.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            variant="primary"
            disabled={saving || !reworded || reworded === line.text}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button
            variant="ghost"
            disabled={saving}
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
          {removing ? (
            <>
              <span className="text-meta text-text">
                Only a redraft brings it back.
              </span>
              <Button
                disabled={saving}
                onClick={() => void save({ remove: [line.id] })}
              >
                Remove it
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => setRemoving(true)}
            >
              Remove line
            </Button>
          )}
        </div>
      </form>
    );
  }

  return (
    <div className="group">
      {line.question && (
        <p className="mb-1 text-meta font-medium text-ink">{line.question}</p>
      )}
      <p
        className={cn(
          'text-report',
          line.pending ? 'text-muted motion-safe:animate-pulse' : 'text-text',
        )}
      >
        <span
          className={cn(
            'transition-colors',
            cited &&
              '-mx-0.5 rounded-[3px] bg-marker-highlight box-decoration-clone px-0.5 text-ink',
          )}
        >
          {line.text}
        </span>
        {line.sourceIds.map((id) => {
          const source = sourceById.get(id);
          return source ? (
            <Fragment key={id}>
              {' '}
              <SourceChip
                number={source.number}
                label={sourceName(source)}
                selected={
                  selected?.sourceId === id &&
                  (selected.lineId === undefined || selected.lineId === line.id)
                }
                onSelect={() => onSelect(id, line.id)}
              />
            </Fragment>
          ) : null;
        })}
        {onEdit && (
          <>
            {' '}
            <button
              type="button"
              aria-label="Edit this line"
              onClick={() => {
                setText(line.text);
                setRemoving(false);
                setEditing(true);
              }}
              className="inline-grid size-6 place-items-center rounded-full align-[-0.2em] text-muted transition-opacity hover:bg-surface hover:text-ink focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            >
              <Pencil aria-hidden className="size-3.5" />
            </button>
          </>
        )}
      </p>
      {line.original !== undefined && (
        <p className="mt-1 text-meta text-muted">
          Edited
          {onEdit && (
            <>
              {' · '}
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void save({ lines: [{ id: line.id, text: line.original! }] })
                }
                className="underline underline-offset-2 hover:text-ink"
              >
                Put back Dossier’s wording
              </button>
            </>
          )}
        </p>
      )}
      {line.sourceIds.length === 0 && !line.pending && (
        <p className="mt-1 flex items-center gap-1.5 text-meta text-muted">
          <CircleDashed aria-hidden className="size-3.5" />
          No source, so this line is left out when you approve.
        </p>
      )}
      {inline && (
        <div className="mt-3 xl:hidden">
          <SourceDetail source={inline} onClose={onClose} />
        </div>
      )}
    </div>
  );
}

/** Who the report goes to, and when, or why it can't go. */
function DeliveryNote({
  delivery,
  status,
  sent,
  client,
  timeZone,
}: {
  delivery: ReportDeliveryStatus;
  status: ReportStatus;
  sent: boolean;
  client: { id: string; name: string };
  timeZone: string;
}) {
  const people = [
    ...delivery.to,
    ...delivery.cc.map((address) => `${address} (copied in)`),
  ].join(', ');
  const [last] = delivery.deliveries;
  const recipientsLink = (
    <Link
      href={`/clients/${client.id}/reports`}
      className="underline underline-offset-2 hover:text-ink"
    >
      {client.name}’s Reports tab
    </Link>
  );
  let note: ReactNode = null;
  if (status === 'skipped') return null;
  if (sent && last?.outcome === 'sent') {
    note = `Went to ${[...last.to, ...last.cc].join(', ')} on ${formatTimestamp(last.at, timeZone)}.`;
  } else if (delivery.to.length === 0) {
    note = <>No one to send it to yet. Add them on {recipientsLink}.</>;
  } else if (status === 'draft') {
    note = delivery.sendAt
      ? `Once approved, it goes to ${people} on ${weeklyTimeLabel(delivery.sendAt)}, or at once if that has passed.`
      : `Once approved, send it to ${people}.`;
  } else if (delivery.sendsAt) {
    note = `Goes to ${people} on ${formatTimestamp(delivery.sendsAt, timeZone)}.`;
  } else {
    note = `Send it to ${people} when it’s ready.`;
  }
  return (
    <div className="mt-3 flex flex-col items-center gap-1 text-center text-meta text-muted">
      {!sent && last?.outcome === 'failed' && (
        <p role="alert" className="text-alert">
          Couldn’t send it on {formatTimestamp(last.at, timeZone)}:{' '}
          {last.problem}
        </p>
      )}
      <p>{note}</p>
    </div>
  );
}

function SourcesPanel({
  sources,
  selectedId,
  onSelect,
  onClose,
}: {
  sources: NumberedSource[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const itemRefs = useRef(new Map<string, HTMLLIElement>());

  useEffect(() => {
    if (!selectedId) return;
    if (!window.matchMedia('(min-width: 1280px)').matches) return;
    itemRefs.current
      .get(selectedId)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  return (
    <>
      <h2 id="sources-heading" className="text-section font-semibold">
        Sources
        <span className="ml-1 font-normal text-muted tabular-nums">
          {' '}
          {sources.length}
        </span>
      </h2>
      <p className="mt-1 text-meta text-muted">
        Every line points to one of these records. Select a number to see it.
      </p>
      {sources.length === 0 ? (
        <p className="mt-4 rounded-tile bg-surface-soft px-4 py-6 text-center text-meta text-muted">
          This report doesn’t cite any sources yet.
        </p>
      ) : (
        <ol className="mt-4 flex flex-col gap-0.5">
          {sources.map((source) => (
            <li
              key={source.id}
              ref={(el) => {
                if (el) itemRefs.current.set(source.id, el);
                else itemRefs.current.delete(source.id);
              }}
              className="scroll-my-4"
            >
              {selectedId === source.id ? (
                <div className="-mx-1 my-1">
                  <SourceDetail source={source} onClose={onClose} />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(source.id)}
                  className="flex w-full items-start gap-2.5 rounded-row px-2 py-2 text-left transition-colors hover:bg-surface-soft"
                >
                  <SourceChip
                    number={source.number}
                    label={sourceName(source)}
                    className="mt-px shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-meta text-ink">
                      {source.kind === 'meeting'
                        ? `${source.speakerName}, ${source.title.toLowerCase()}`
                        : source.title}
                    </span>
                    <span className="block truncate font-mono text-mono text-muted">
                      {sourceOrigin(source)} ·{' '}
                      {source.kind === 'meeting'
                        ? source.transcriptAt
                        : source.kind === 'note'
                          ? source.recordedAt.slice(0, 10)
                          : source.recordId}
                    </span>
                  </span>
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function SourceDetail({
  source,
  onClose,
}: {
  source: NumberedSource;
  onClose: () => void;
}) {
  const tool = sourceOrigin(source);
  return (
    <section
      aria-label={`Source ${source.number}: ${sourceName(source)}`}
      className="rounded-card bg-sheet p-4 shadow-float"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <SourceChip
            number={source.number}
            label={sourceName(source)}
            selected
          />
          <ConnectorTile tool={source.tool} size="sm" />
          <div>
            <p className="text-meta font-medium text-ink">{tool}</p>
            <p className="text-meta-sm text-muted">{source.recordType}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close source"
          onClick={onClose}
          className="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>

      <p className="mt-3 font-medium text-ink">{source.title}</p>
      {source.kind === 'meeting' && (
        <figure className="mt-2 rounded-row bg-marker-highlight px-3 py-2">
          <blockquote className="text-meta text-ink">
            “{source.quote}”
          </blockquote>
          <figcaption className="mt-1 font-mono text-mono text-muted">
            {source.speakerName},{' '}
            {source.speakerRole === 'client' ? 'client' : 'MSP'}
            {' · '}
            {source.transcriptAt}
          </figcaption>
        </figure>
      )}
      {source.kind === 'note' && source.quote && (
        <figure className="mt-2 rounded-row bg-marker-highlight px-3 py-2">
          <blockquote className="text-meta text-ink">
            “{source.quote}”
          </blockquote>
          <figcaption className="mt-1 font-mono text-mono text-muted">
            From the notes
          </figcaption>
        </figure>
      )}

      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-meta">
        <dt className="text-muted">Record</dt>
        <dd className="font-mono text-mono text-ink">{source.recordId}</dd>
        {source.fields.map((field) => (
          <Fragment key={field.label}>
            <dt className="text-muted">{field.label}</dt>
            <dd className="break-words text-ink">
              {source.tool === 'fathom' && field.label === SUMMARY_FIELD ? (
                <Markdown text={field.value} />
              ) : (
                field.value
              )}
            </dd>
          </Fragment>
        ))}
      </dl>

      <a
        href={source.url}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex items-center gap-1.5 rounded-row text-meta font-medium text-brand-deep underline-offset-2 hover:underline"
      >
        Open in {tool}
        <ExternalLink aria-hidden className="size-3.5" />
      </a>
    </section>
  );
}
