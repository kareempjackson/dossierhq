import type { Device } from '@dossierhq/contracts';
import { Suspense } from 'react';
import {
  ClientSheet,
  ClientSheetSkeleton,
  loadClient,
} from '@/components/client/client-sheet';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { StatusDot, type StatusTone } from '@/components/ui/status-dot';
import { getClient, getDevices, getNow, getWorkspace } from '@/lib/data';
import { formatRelative } from '@/lib/format';

const patch: Record<
  Device['patchStatus'],
  { tone: StatusTone; label: string }
> = {
  current: { tone: 'positive', label: 'Up to date' },
  pending: { tone: 'neutral', label: 'Pending' },
  failed: { tone: 'failure', label: 'Failed' },
};

const types: Record<Device['type'], string> = {
  workstation: 'Workstation',
  laptop: 'Laptop',
  server: 'Server',
  network: 'Network',
};

export async function generateMetadata({
  params,
}: PageProps<'/clients/[id]/devices'>) {
  const client = await getClient((await params).id).catch(() => null);
  return { title: client ? `${client.name} devices` : 'Devices' };
}

export default function DevicesPage({
  params,
}: PageProps<'/clients/[id]/devices'>) {
  return (
    <Suspense fallback={<ClientSheetSkeleton />}>
      <Devices params={params} />
    </Suspense>
  );
}

async function Devices({
  params,
}: Pick<PageProps<'/clients/[id]/devices'>, 'params'>) {
  const client = await loadClient(params);
  const [devices, now, workspace] = await Promise.all([
    getDevices({ clientId: client.id }).catch(() => null),
    getNow(),
    getWorkspace(),
  ]);

  return (
    <ClientSheet client={client} tab="devices">
      {devices === null ? (
        <ErrorState what="devices" />
      ) : devices.length === 0 ? (
        <EmptyState title="No devices yet.">
          Devices appear once NinjaOne reports them for {client.name}.
        </EmptyState>
      ) : (
        <>
          <p className="text-meta text-muted">
            From NinjaOne. Devices that need work are listed first.
          </p>
          <div className="mt-3 overflow-x-auto rounded-card bg-sheet shadow-card">
            <table className="w-full min-w-180 text-left">
              <caption className="sr-only">
                Devices at {client.name}, devices needing work first
              </caption>
              <thead className="text-meta text-muted">
                <tr className="border-b border-hairline">
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Device
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Type
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Operating system
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Used by
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Last seen
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Patches
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {devices.map((device) => (
                  <tr key={device.id}>
                    <th
                      scope="row"
                      className="px-4 py-2.5 font-mono text-mono font-normal text-ink"
                    >
                      {device.name}
                    </th>
                    <td className="px-4 py-2.5">{types[device.type]}</td>
                    <td className="px-4 py-2.5">{device.os}</td>
                    <td className="px-4 py-2.5 text-muted">
                      {device.assignedTo ?? 'Not assigned'}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted">
                      {formatRelative(
                        device.lastSeenAt,
                        now,
                        workspace.timeZone,
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <StatusDot
                        tone={patch[device.patchStatus].tone}
                        label={patch[device.patchStatus].label}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ClientSheet>
  );
}
