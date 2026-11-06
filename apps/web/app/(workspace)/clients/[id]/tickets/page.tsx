import {
  ClientTab,
  ReadFailed,
  clientTabMetadata,
} from '@/components/clients/client-tab';
import { TicketsView } from '@/components/clients/tickets-view';
import { ticketPattern, ticketRows } from '@/lib/client-views';
import { getThemes, getTickets } from '@/lib/data/client-records';
import { orNull } from '@/lib/data/safe';

export const generateMetadata = ({
  params,
}: PageProps<'/clients/[id]/tickets'>) => clientTabMetadata(params, 'Tickets');

/** The client's tickets, and any pattern in them. */
export default function TicketsPage({
  params,
}: PageProps<'/clients/[id]/tickets'>) {
  return (
    <ClientTab
      params={params}
      render={async (client, context) => {
        const [tickets, themes] = await Promise.all([
          getTickets(client.id).catch(orNull),
          getThemes(client.id).catch(orNull),
        ]);
        if (tickets === null) {
          return <ReadFailed what="this client’s tickets" />;
        }
        return (
          <TicketsView
            clientId={client.id}
            tickets={ticketRows(tickets, context)}
            pattern={ticketPattern(themes ?? [], tickets)}
          />
        );
      }}
    />
  );
}
