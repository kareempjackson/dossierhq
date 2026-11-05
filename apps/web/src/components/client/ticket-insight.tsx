import {
  TICKET_CATEGORY_NAMES,
  type InsightLine,
  type SimilarTicket,
  type TicketInsight,
  type TicketOutcome,
} from '@dossierhq/contracts';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import {
  CopyForClient,
  ExecutiveBriefView,
} from '@/components/ui/executive-brief';
import { Panel } from '@/components/ui/panel';
import { Pill } from '@/components/ui/pill';
import { Skeleton } from '@/components/ui/states';
import { Styled, StyleSwitch } from '@/components/ui/style-switch';
import { getSources, getTicketInsight } from '@/lib/data';
import { orEmpty, orNull } from '@/lib/data/safe';
import { formatCalendarDate } from '@/lib/format';
import { readingStyle } from '@/lib/writing-style';

const OUTCOMES: Record<
  TicketOutcome,
  { label: string; tone: 'positive' | 'quiet' | 'neutral' }
> = {
  resolved: { label: 'Resolved', tone: 'positive' },
  workaround: { label: 'Workaround', tone: 'neutral' },
  unresolved: { label: 'Not resolved', tone: 'neutral' },
  open: { label: 'Open', tone: 'quiet' },
};

/** What Dossier read off the ticket, and tickets like it from before. */
export async function TicketInsightPanels({ ticketId }: { ticketId: string }) {
  const [view, style] = await Promise.all([
    getTicketInsight(ticketId).catch(orNull),
    readingStyle(),
  ]);
  if (view === null) return null;
  return (
    <>
      <Panel
        id="ticket-read-heading"
        as="h3"
        title="Dossier’s read"
        note={view.insight ? <StyleSwitch initial={style} /> : undefined}
      >
        {view.insight ? (
          <Styled
            initial={style}
            technical={<TechnicalRead read={view.insight} />}
            executive={<ExecutiveRead read={view.insight} />}
          />
        ) : (
          <p className="text-meta text-muted">
            {view.reading
              ? 'Not read yet. Dossier reads changed tickets a few minutes after each sync.'
              : 'Reading tickets is off on the Intelligence page.'}
          </p>
        )}
      </Panel>
      {view.similar.length > 0 && <SeenBefore similar={view.similar} />}
    </>
  );
}

function TechnicalRead({ read }: { read: TicketInsight }) {
  const outcome = OUTCOMES[read.outcome];
  return (
    <div className="flex flex-col gap-3 text-meta">
      <div>
        <p className="font-medium text-ink">{read.issue}</p>
        <p className="mt-1 text-text">{read.summary}</p>
        <p className="mt-2 flex flex-wrap gap-1.5">
          <Pill tone={outcome.tone}>{outcome.label}</Pill>
          <Pill tone="quiet">{TICKET_CATEGORY_NAMES[read.category]}</Pill>
          {(read.sentiment === 'frustrated' || read.sentiment === 'angry') && (
            <Pill tone="neutral">Client {read.sentiment}</Pill>
          )}
        </p>
      </div>
      {read.tried.length > 0 && (
        <Lines title="Tried" lines={read.tried} ordered />
      )}
      {read.rootCause && <Lines title="Cause" lines={[read.rootCause]} />}
      {read.resolution && <Lines title="Fixed by" lines={[read.resolution]} />}
      {read.followUps.length > 0 && (
        <Lines
          title="Still owed"
          lines={read.followUps.map((f) => ({
            ...f,
            text: `${f.text} (${f.owner === 'msp' ? 'us' : 'the client'})`,
          }))}
        />
      )}
    </div>
  );
}

function Lines({
  title,
  lines,
  ordered = false,
}: {
  title: string;
  lines: InsightLine[];
  ordered?: boolean;
}) {
  const List = ordered ? 'ol' : 'ul';
  return (
    <div>
      <p className="text-meta-sm font-medium text-muted">{title}</p>
      <List
        className={
          ordered
            ? 'mt-1 flex list-decimal flex-col gap-1 pl-5 text-text marker:text-muted'
            : 'mt-1 flex flex-col gap-1 text-text'
        }
      >
        {lines.map((line, index) => (
          <li key={index}>
            {line.text}
            {line.internal && (
              <span className="ml-1.5 text-meta-sm text-muted">
                (internal note)
              </span>
            )}
          </li>
        ))}
      </List>
    </div>
  );
}

function ExecutiveRead({ read }: { read: TicketInsight }) {
  if (!read.executive) {
    return (
      <p className="text-meta text-muted">
        No version for the client: what Dossier could say rests on internal
        notes.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ExecutiveBriefView brief={read.executive} as="p" className="text-meta" />
      <CopyForClient brief={read.executive} className="-ml-3" />
    </div>
  );
}

async function SeenBefore({ similar }: { similar: SimilarTicket[] }) {
  const archived = similar.filter((t) => !t.live && t.sourceId);
  const sources = archived.length
    ? await getSources(archived.map((t) => t.sourceId!)).catch(orEmpty)
    : [];
  const urlOf = new Map(sources.map((s) => [s.id, s.url]));
  return (
    <Panel
      id="seen-before-heading"
      as="h3"
      title="Seen before"
      note="Similar tickets"
    >
      <ul className="flex flex-col divide-y divide-hairline">
        {similar.map((ticket) => {
          const outcome = ticket.outcome && OUTCOMES[ticket.outcome];
          const label = `#${ticket.number} ${ticket.subject}`;
          const url = ticket.sourceId ? urlOf.get(ticket.sourceId) : undefined;
          return (
            <li key={ticket.ticketId} className="py-2.5 first:pt-0 last:pb-0">
              <p className="text-meta-sm text-muted">
                {ticket.clientName} ·{' '}
                {formatCalendarDate(ticket.openedAt.slice(0, 10))}
              </p>
              {ticket.live ? (
                <Link
                  href={`/clients/${encodeURIComponent(ticket.clientId)}/tickets/${encodeURIComponent(ticket.ticketId)}`}
                  className="text-meta text-ink underline-offset-2 hover:underline"
                >
                  {label}
                </Link>
              ) : url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-meta text-ink underline-offset-2 hover:underline"
                >
                  {label}
                  <ExternalLink aria-hidden className="size-3" />
                </a>
              ) : (
                <p className="text-meta text-ink">{label}</p>
              )}
              {(outcome || ticket.resolution) && (
                <p className="mt-1 text-meta text-text">
                  {outcome && (
                    <Pill tone={outcome.tone} className="mr-1.5">
                      {outcome.label}
                    </Pill>
                  )}
                  {ticket.resolution}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export function TicketInsightSkeleton() {
  return (
    <div className="rounded-card bg-sheet p-4 shadow-card">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-3 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-4/5" />
    </div>
  );
}
