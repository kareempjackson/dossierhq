import {
  ClientTab,
  ReadFailed,
  clientTabMetadata,
} from '@/components/clients/client-tab';
import { UsersView } from '@/components/clients/users-view';
import { userRows } from '@/lib/client-views';
import { getEndUsers } from '@/lib/data/client-records';
import { orNull } from '@/lib/data/safe';

export const generateMetadata = ({
  params,
}: PageProps<'/clients/[id]/users'>) => clientTabMetadata(params, 'Users');

/**
 * The people who work at the client: who signs in to its devices, raises
 * tickets and comes to meetings, from NinjaOne and Fathom, and the primary
 * contact. Choosing one opens their page.
 */
export default function UsersPage({
  params,
}: PageProps<'/clients/[id]/users'>) {
  return (
    <ClientTab
      params={params}
      render={async (client, context) => {
        const users = await getEndUsers(client.id).catch(orNull);
        if (users === null) {
          return <ReadFailed what="the people at this client" />;
        }
        return (
          <UsersView
            clientId={client.id}
            clientName={client.name}
            users={userRows(users, context)}
          />
        );
      }}
    />
  );
}
