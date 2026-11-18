import type { Ticket } from '@dossierhq/contracts';
import { unstable_rethrow } from 'next/navigation';
import { Mark } from '@/components/brand/logo';
import { Tag } from '@/components/ui/tag';
import { TextLink } from '@/components/ui/text-link';
import {
  ticketRead,
  type InsightRow,
  type TicketRead,
  type When,
} from '@/lib/client-views';
import { getTicketInsight } from '@/lib/data/client-records';

/**
 * Dossier's read of one ticket, and tickets like it. Both come from one
 * request, shared by React's cache(), so each part can sit in its own
 * place on the page and its own Suspense.
 */
async function readOf(
  ticket: Ticket,
  clientName: string,
  when: When,
): Promise<TicketRead | null> {
  try {
    return ticketRead(
      await getTicketInsight(ticket.id),
      ticket,
      clientName,
      when,
    );
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
}

/**
 * What went wrong, what was tried, how it was fixed and what's still owed,
 * as Dossier read the whole conversation. Lines from internal notes say so.
 */
export async function TicketInsight({
  ticket,
  clientName,
  when,
}: {
  ticket: Ticket;
  clientName: string;
  when: When;
}) {
  const read = await readOf(ticket, clientName, when);

  return (
    <section
      aria-labelledby="dossier-read"
      className="rounded-2xl bg-linear-to-br from-lilac-mist to-lilac-soft p-5"
    >
      <h3
        id="dossier-read"
        className="flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-small font-normal tracking-normal text-lilac-ink"
      >
        <Mark height={12} />
        Dossier’s read
        {read?.state === 'read' && (
          <span className="text-muted">
            · {read.category} ·{' '}
            <span title={read.readFull}>read {read.read}</span>
          </span>
        )}
      </h3>

      {read === null ? (
        <p role="alert" className="mt-2 text-small text-muted">
          Dossier couldn’t load its read of this ticket just now. Reload the
          page to try again.
        </p>
      ) : read.state === 'off' ? (
        <p className="mt-2 text-small text-muted">
          Dossier isn’t reading tickets here. It needs Reading tickets on,
          Tickets shared with the model, and a key for the reading model. See{' '}
          <TextLink href="/intelligence">Intelligence</TextLink>.
        </p>
      ) : read.state === 'unread' ? (
        <p className="mt-2 text-small text-muted">
          Not read yet. Dossier reads tickets after each NinjaOne sync.
        </p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <p className="min-w-0 flex-1 basis-64 font-display text-h3">
              {read.summary}
            </p>
            <Tag tone={read.outcome.tone}>{read.outcome.label}</Tag>
          </div>
          {read.changedSince && (
            <p className="mt-2 text-[0.75rem] text-muted">
              The ticket has changed since. Dossier reads it again after the
              next sync.
            </p>
          )}
          {read.symptoms.length > 0 && (
            <Lines
              title="What they saw"
              lines={read.symptoms.map((text) => ({ text, internal: false }))}
            />
          )}
          <Lines title="What was tried" lines={read.tried} />
          {read.rootCause && <Lines title="Why" lines={[read.rootCause]} />}
          {read.resolution && (
            <Lines title="How it was fixed" lines={[read.resolution]} />
          )}
          <Lines
            title="Still owed"
            lines={read.followUps.map((line) => ({
              ...line,
              text: `${line.owner}: ${line.text}`,
            }))}
          />
          {read.sentiment && (
            <p className="mt-4 text-small text-muted">
              <span className="font-medium text-ink">For your team only:</span>{' '}
              {read.sentiment}
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** Tickets like this one, here or at other clients, and how they went. */
export async function SimilarTickets({
  ticket,
  clientName,
  when,
}: {
  ticket: Ticket;
  clientName: string;
  when: When;
}) {
  const read = await readOf(ticket, clientName, when);
  if (!read || read.similar.length === 0) return null;

  return (
    <section aria-labelledby="similar-tickets">
      <h3
        id="similar-tickets"
        className="mb-2 font-sans text-[0.75rem] font-normal tracking-normal text-muted"
      >
        Tickets like this
      </h3>
      <ul className="flex flex-col gap-2">
        {read.similar.map((other) => (
          <li key={other.id} className="rounded-lg bg-grey-1 px-3 py-2.5">
            <p className="text-small">
              <span className="font-mono text-[0.75rem] text-muted">
                #{other.number}
              </span>{' '}
              {other.href ? (
                <TextLink href={other.href} className="font-normal">
                  {other.subject}
                </TextLink>
              ) : (
                other.subject
              )}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.75rem] text-muted">
              {other.clientName && <span>{other.clientName}</span>}
              <span>Opened {other.opened}</span>
              {other.outcome && (
                <Tag tone={other.outcome.tone} className="text-[0.75rem]">
                  {other.outcome.label}
                </Tag>
              )}
            </p>
            {other.resolution && (
              <p className="mt-1.5 text-[0.75rem]">{other.resolution}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A list in Dossier's read; lines from internal notes are tagged. */
function Lines({ title, lines }: { title: string; lines: InsightRow[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="text-[0.75rem] text-muted">{title}</p>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {lines.map((line, index) => (
          <li
            key={index}
            className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded-lg bg-white/70 px-3 py-2 text-small"
          >
            <span className="min-w-0 flex-1">{line.text}</span>
            {line.internal && (
              <Tag tone="neutral" className="text-[0.75rem]">
                Internal
              </Tag>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
