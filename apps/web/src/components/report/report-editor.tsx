'use client';

import {
  TOOL_NAMES,
  type Report,
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
  X,
} from 'lucide-react';
import Link from 'next/link';
import {
  Fragment,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from 'react';
import { setReportStatus } from '@/app/actions';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button, ButtonLink } from '@/components/ui/button';
import { ConnectorTile } from '@/components/ui/connector-tile';
import { Sheet } from '@/components/ui/sheet';
import { SourceChip } from '@/components/ui/source-chip';
import { StatusDot } from '@/components/ui/status-dot';
import { cn } from '@/lib/cn';
import { sourceName } from '@/lib/sources';

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
};

/**
 * The report on one sheet, its sources on another. Selecting a citation
 * highlights the line and opens the record; Approve, Skip and Copy are UI
 * only until the API exists.
 */
export function ReportEditor({
  report,
  client,
  weekLabel,
  meta,
  sources,
  nav,
  approvedLabel,
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
    section.lines.filter((line) => line.sourceIds.length === 0),
  ).length;
  const draft = status === 'draft';

  async function copy() {
    const text = [
      report.title,
      meta,
      '',
      ...report.sections.flatMap((section) => {
        const lines = section.lines.filter((line) => line.sourceIds.length > 0);
        return lines.length > 0
          ? [section.title, ...lines.map((line) => `- ${line.text}`), '']
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
                (approvedLabel ?? 'Approved')
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
            <Button variant="ghost" onClick={copy} className="max-sm:px-3">
              <Copy aria-hidden />
              <span className="sr-only sm:not-sr-only">Copy</span>
            </Button>
            {draft ? (
              <Button
                variant="primary"
                disabled={pending}
                onClick={() => decide('approved')}
              >
                {pending ? 'Saving…' : 'Approve'}
              </Button>
            ) : (
              decidedHere && (
                <>
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => decide('draft')}
                  >
                    Undo
                  </Button>
                  {nav?.nextHref && (
                    <ButtonLink href={nav.nextHref}>Next report</ButtonLink>
                  )}
                </>
              )
            )}
          </div>
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
}: {
  line: ReportLine;
  cited: boolean;
  selected: Selection | null;
  sourceById: Map<string, NumberedSource>;
  onSelect: (sourceId: string, lineId: string) => void;
  onClose: () => void;
}) {
  const inline =
    selected?.lineId === line.id
      ? sourceById.get(selected.sourceId)
      : undefined;

  return (
    <div>
      <p className="text-report text-text">
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
      </p>
      {line.sourceIds.length === 0 && (
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
                      {TOOL_NAMES[source.tool]} ·{' '}
                      {source.kind === 'meeting'
                        ? source.transcriptAt
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
  const tool = TOOL_NAMES[source.tool];
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

      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-meta">
        <dt className="text-muted">Record</dt>
        <dd className="font-mono text-mono text-ink">{source.recordId}</dd>
        {source.fields.map((field) => (
          <Fragment key={field.label}>
            <dt className="text-muted">{field.label}</dt>
            <dd className="break-words text-ink">{field.value}</dd>
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
