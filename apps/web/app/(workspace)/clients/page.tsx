import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReadFailed } from '@/components/clients/client-tab';
import {
  ClientsTable,
  ClientsTableFromUrl,
} from '@/components/clients/clients-table';
import { TopBar } from '@/components/shell/top-bar';
import { IndexLoader } from '@/components/ui/index-loader';
import { LoaderPart, RevealPart } from '@/components/ui/reveal';
import { clientRows, lastRead } from '@/lib/client-views';
import { getMe } from '@/lib/data/auth';
import { getAllDevices } from '@/lib/data/client-records';
import { getClientList } from '@/lib/data/clients';
import { getConnectors } from '@/lib/data/connectors';
import { orNull } from '@/lib/data/safe';
import { ago, plural } from '@/lib/format';

export const metadata: Metadata = { title: 'Clients' };

/**
 * Every client file, from the API, most urgent first. The frame draws at
 * once; the clients stream in behind it. The title holds still while the
 * table arrives.
 */
export default function ClientsPage() {
  return (
    <Suspense
      fallback={
        <>
          <TopBar title="Clients" subtitle="" />
          <LoaderPart>
            <div className="mt-6">
              <IndexLoader className="h-[26rem]" label="Loading your clients" />
            </div>
          </LoaderPart>
        </>
      }
    >
      <Clients />
    </Suspense>
  );
}

async function Clients() {
  const [items, devices, connectors, me] = await Promise.all([
    getClientList().catch(orNull),
    getAllDevices().catch(orNull),
    getConnectors().catch(orNull),
    getMe(),
  ]);
  const now = new Date();
  const timeZone = me.workspace.timeZone;
  const read = connectors && lastRead(connectors);

  if (items === null) {
    return (
      <>
        <TopBar title="Clients" subtitle="" />
        <div className="mt-6">
          <ReadFailed what="your clients" />
        </div>
      </>
    );
  }

  const clients = clientRows(items, devices, { timeZone, now });
  return (
    <>
      <TopBar
        title="Clients"
        subtitle={
          clients.length === 0
            ? 'Client files appear once a tool is connected'
            : [
                plural(clients.length, 'client file'),
                read
                  ? `read ${ago(read, now, timeZone)}`
                  : 'first read running',
              ].join(' · ')
        }
      />
      <RevealPart>
        <div className="mt-6">
          {/* The tab comes from the URL, which only the browser knows. */}
          <Suspense fallback={<ClientsTable clients={clients} view="all" />}>
            <ClientsTableFromUrl clients={clients} />
          </Suspense>
        </div>
      </RevealPart>
    </>
  );
}
