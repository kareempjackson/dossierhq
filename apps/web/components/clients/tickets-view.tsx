'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ButtonLink } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import { cn } from '@/lib/cn';
import { STUCK_AFTER_DAYS, ticketHref } from '@/lib/client-paths';
import type { TicketPattern, TicketRow as Ticket } from '@/lib/client-views';

const FILTERS = [
  { value: 'open', label: 'Open', test: (ticket: Ticket) => ticket.open },
  { value: 'stuck', label: 'Stuck', test: (ticket: Ticket) => ticket.stuck },
  {
    value: 'closed',
    label: 'Closed this month',
    test: (ticket: Ticket) => ticket.closedThisMonth,
  },
] as const;

const EMPTY: Record<(typeof FILTERS)[number]['value'], string> = {
  open: 'No open tickets.',
  stuck: `Nothing stuck. Every open ticket moved in the last ${STUCK_AFTER_DAYS} days.`,
  closed: 'Nothing closed this month yet.',
};

/** The client's tickets, and any pattern Dossier sees in them. */
export function TicketsView({
  clientId,
  tickets,
  pattern,
}: {
  clientId: string;
  tickets: Ticket[];
  pattern: TicketPattern | null;
}) {
  const [filter, setFilter] =
    useState<(typeof FILTERS)[number]['value']>('open');
  const shown = tickets.filter(
    FILTERS.find((option) => option.value === filter)!.test,
  );

  return (
    <>
      <div
        role="group"
        aria-label="Which tickets"
        className="flex flex-wrap gap-2"
      >
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
            className={cn(
              'rounded-full px-3 py-1 text-small transition-colors',
              filter === option.value
                ? 'bg-white text-ink ring-1 ring-grey-3'
                : 'bg-grey-2 text-muted hover:text-ink',
            )}
          >
            {option.label} {tickets.filter(option.test).length}
          </button>
        ))}
      </div>

      {shown.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[48rem] border-separate border-spacing-y-1 text-left text-small">
            <thead>
              <tr className="text-[0.6875rem] text-muted">
                {[
                  'Ticket',
                  'Reported by',
                  'Priority',
                  'Status',
                  'Technician',
                ].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="px-4 pb-2 font-normal"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((ticket) => (
                <tr
                  key={ticket.id}
                  className="relative odd:[&>td]:bg-grey-1 [&>td]:transition-colors hover:[&>td]:bg-grey-2"
                >
                  <td className="rounded-l-xl px-4 py-3.5">
                    <Link
                      href={ticketHref(clientId, ticket.number)}
                      className="rounded-sm font-semibold after:absolute after:inset-0"
                    >
                      #{ticket.number} {ticket.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5 text-muted">
                    {ticket.reportedBy ?? '—'}
                  </td>
                  <td className="px-4 py-3.5">
                    <Tag tone={ticket.priority.tone}>
                      {ticket.priority.label}
                    </Tag>
                  </td>
                  <td className="px-4 py-3.5 text-muted">{ticket.status}</td>
                  <td
                    className="rounded-r-xl px-4 py-3.5 text-muted"
                    title={
                      ticket.technicians.length > 1
                        ? ticket.technicians.join(', ')
                        : undefined
                    }
                  >
                    {ticket.technician}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-grey-1 px-4 py-8 text-center text-small text-muted">
          {tickets.length === 0
            ? 'No tickets yet. Connect NinjaOne to bring in this client’s tickets.'
            : EMPTY[filter]}
        </p>
      )}

      {pattern && (
        <section
          aria-labelledby="ticket-pattern"
          className="mt-6 rounded-2xl bg-linear-to-br from-lime-soft to-[color-mix(in_oklab,var(--color-lime-soft)_60%,white)] p-5"
        >
          <div className="flex flex-wrap items-center gap-3">
            <Tag tone="act">Pattern</Tag>
            <h2
              id="ticket-pattern"
              className="font-sans text-base font-medium tracking-normal"
            >
              {pattern.title}
            </h2>
          </div>
          <p className="mt-2 text-small text-muted">{pattern.body}</p>
          {pattern.ticket && (
            <ButtonLink
              href={ticketHref(clientId, pattern.ticket)}
              variant="ink"
              size="sm"
              className="mt-4"
            >
              Open ticket #{pattern.ticket}
            </ButtonLink>
          )}
        </section>
      )}
    </>
  );
}
