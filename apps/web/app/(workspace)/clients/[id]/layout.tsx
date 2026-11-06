import { notFound, unstable_rethrow } from 'next/navigation';
import { ReadFailed } from '@/components/clients/client-tab';
import { ClientTabs } from '@/components/clients/client-tabs';
import { TopBar } from '@/components/shell/top-bar';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';
import { clientSummary, isSharePointFile, lastRead } from '@/lib/client-views';
import { getMe } from '@/lib/data/auth';
import {
  getClientSources,
  getDevices,
  getEndUsers,
  getMeetings,
  getTickets,
} from '@/lib/data/client-records';
import { getClient } from '@/lib/data/clients';
import { getConnectors } from '@/lib/data/connectors';
import { orNull } from '@/lib/data/safe';
import { ago, plural } from '@/lib/format';

/**
 * Client files are per workspace and read at request time. Cache Components
 * needs one param to build the route's static shell, so a placeholder
 * stands in; no client has that id.
 */
export function generateStaticParams() {
  return [{ id: '__shell__' }];
}

/**
 * Every tab of a client's file: the name, the tabs and the sheet. It depends
 * on the URL, so it sits in Suspense for instant navigation.
 */
export default function ClientLayout({
  params,
  children,
}: LayoutProps<'/clients/[id]'>) {
  return (
    <Reveal
      fallback={
        <IndexLoader className="h-[37rem]" label="Reading this client" />
      }
    >
      <ClientFrame params={params}>{children}</ClientFrame>
    </Reveal>
  );
}

async function ClientFrame({
  params,
  children,
}: Pick<LayoutProps<'/clients/[id]'>, 'params' | 'children'>) {
  const { id } = await params;
  const client = await getClient(id).catch((error: unknown) => {
    unstable_rethrow(error);
    return undefined;
  });
  if (client === null) notFound();
  if (client === undefined) {
    return (
      <>
        <TopBar title="Client file" subtitle="" />
        <div className="mt-6">
          <ReadFailed what="this client" />
        </div>
      </>
    );
  }
  // The counts on the tabs. A count that can't be read is left off.
  const [devices, users, sources, meetings, tickets, connectors, me] =
    await Promise.all([
      getDevices(id).catch(orNull),
      getEndUsers(id).catch(orNull),
      getClientSources(id).catch(orNull),
      getMeetings(id).catch(orNull),
      getTickets(id).catch(orNull),
      getConnectors().catch(orNull),
      getMe(),
    ]);
  const read = connectors && lastRead(connectors);
  const subtitle = [
    clientSummary(client) ?? 'Client file',
    devices && plural(devices.length, 'device'),
    read && `read ${ago(read, new Date(), me.workspace.timeZone)}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <TopBar title={client.name} subtitle={subtitle} />
      <div className="mt-6 rounded-3xl bg-grey-2 p-2.5 sm:p-3">
        <ClientTabs
          base={`/clients/${encodeURIComponent(client.id)}`}
          counts={{
            devices: devices?.length,
            users: users?.length,
            files: sources?.filter(isSharePointFile).length,
            meetings: meetings?.length,
            tickets: tickets?.filter((ticket) => ticket.open).length,
          }}
        >
          {children}
        </ClientTabs>
      </div>
    </>
  );
}
