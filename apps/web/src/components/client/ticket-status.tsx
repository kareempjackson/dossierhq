import type { Ticket } from '@dossierhq/contracts';
import { StatusDot, type StatusTone } from '@/components/ui/status-dot';

const urgency: Record<
  Ticket['urgency'],
  { tone: StatusTone; label: string | null }
> = {
  critical: { tone: 'failure', label: 'Critical' },
  high: { tone: 'strong', label: 'High priority' },
  normal: { tone: 'neutral', label: null },
};

/** Where a ticket's at, with its urgency while it's open. */
export function TicketStatus({
  ticket,
  className,
}: {
  ticket: Pick<Ticket, 'status' | 'open' | 'urgency'>;
  className?: string;
}) {
  const level = urgency[ticket.urgency];
  return (
    <StatusDot
      tone={ticket.open ? level.tone : 'positive'}
      label={
        ticket.open && level.label
          ? `${ticket.status} · ${level.label}`
          : ticket.status
      }
      className={className}
    />
  );
}
