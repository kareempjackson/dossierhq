import type { EndUser } from '@dossierhq/contracts';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  ClientSheet,
  ClientSheetSkeleton,
  loadClient,
} from '@/components/client/client-sheet';
import { DataList, type DataRow } from '@/components/ui/data-list';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { getClient, getEndUsers, getNow, getWorkspace } from '@/lib/data';
import { formatList, formatRelative } from '@/lib/format';
import { orNull } from '@/lib/data/safe';
import { presentOptions } from '@/lib/list-options';

const TICKETS = { open: 'Open', none: 'None open' };
const ticketsOf = (user: EndUser): keyof typeof TICKETS =>
  user.openTickets > 0 ? 'open' : 'none';

export async function generateMetadata({
  params,
}: PageProps<'/clients/[id]/users'>) {
  const client = await getClient((await params).id).catch(orNull);
  return { title: client ? `${client.name} users` : 'Users' };
}

export default function UsersPage({
  params,
}: PageProps<'/clients/[id]/users'>) {
  return (
    <Suspense fallback={<ClientSheetSkeleton />}>
      <Users params={params} />
    </Suspense>
  );
}

async function Users({
  params,
}: Pick<PageProps<'/clients/[id]/users'>, 'params'>) {
  const client = await loadClient(params);
  const [users, now, workspace] = await Promise.all([
    getEndUsers(client.id).catch(orNull),
    getNow(),
    getWorkspace(),
  ]);

  const rows: DataRow[] = (users ?? []).map((user) => {
    const facts = endUserFacts(user);
    return {
      id: user.id,
      text: [user.name, user.email, ...user.signIns, user.role]
        .filter(Boolean)
        .join(' '),
      values: { tickets: ticketsOf(user) },
      node: (
        <tr className="align-top transition-colors hover:bg-surface-soft">
          <th scope="row" className="px-4 py-2.5 font-normal">
            <Link
              href={`/clients/${client.id}/users/${encodeURIComponent(user.id)}`}
              className="rounded-row font-medium text-ink underline-offset-2 hover:underline"
            >
              {user.name}
            </Link>
            {facts && (
              <span className="block text-meta text-muted">{facts}</span>
            )}
          </th>
          <td className="px-4 py-2.5 tabular-nums">
            <Count n={user.deviceIds.length} />
          </td>
          <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
            <Count n={user.tickets} />
            {user.openTickets > 0 && (
              <span className="text-muted"> · {user.openTickets} open</span>
            )}
          </td>
          <td className="px-4 py-2.5 tabular-nums">
            <Count n={user.meetings} />
          </td>
          <td className="px-4 py-2.5 whitespace-nowrap text-muted">
            {user.lastContactAt
              ? formatRelative(user.lastContactAt, now, workspace.timeZone)
              : 'None yet'}
          </td>
        </tr>
      ),
    };
  });

  return (
    <ClientSheet client={client} tab="users">
      {users === null ? (
        <ErrorState what="users" />
      ) : users.length === 0 ? (
        <EmptyState title="No users yet.">
          People at {client.name} appear once NinjaOne reports who signs in to
          their devices, or they raise a ticket or join a recorded meeting.
        </EmptyState>
      ) : (
        <>
          <p className="mb-4 text-meta text-muted">
            Who signs in to {client.name}’s devices, raises tickets and comes to
            meetings, from NinjaOne and Fathom. Your own team is left out.
          </p>
          <DataList
            rows={rows}
            noun={['user', 'users']}
            placeholder="Search name, email, sign-in"
            filters={[
              {
                name: 'tickets',
                label: 'Tickets',
                options: presentOptions(users.map(ticketsOf), TICKETS),
              },
            ]}
            layout={{
              kind: 'table',
              caption: `People at ${client.name}, by name`,
              head: (
                <thead className="text-meta text-muted">
                  <tr className="border-b border-hairline">
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      User
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Devices
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Tickets
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Meetings
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Last contact
                    </th>
                  </tr>
                </thead>
              ),
            }}
          />
        </>
      )}
    </ClientSheet>
  );
}

/**
 * What is known about someone besides their records, in one line, e.g.
 * "Practice manager · Primary contact · Signs in as PriyaN".
 */
function endUserFacts(user: EndUser): string {
  return [
    user.role,
    user.primaryContact ? 'Primary contact' : null,
    // Someone known only by email is already named by it.
    user.email !== user.name.toLowerCase() ? user.email : null,
    user.signIns.length > 0 ? `Signs in as ${formatList(user.signIns)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function Count({ n }: { n: number }) {
  return n > 0 ? n : <span className="text-muted">0</span>;
}
