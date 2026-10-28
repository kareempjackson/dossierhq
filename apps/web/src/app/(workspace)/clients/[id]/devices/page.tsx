import type { Device } from '@dossierhq/contracts';
import { Suspense } from 'react';
import {
  ClientSheet,
  ClientSheetSkeleton,
  loadClient,
} from '@/components/client/client-sheet';
import { DataList, type DataRow } from '@/components/ui/data-list';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { StatusDot, type StatusTone } from '@/components/ui/status-dot';
import { getClient, getDevices, getNow, getWorkspace } from '@/lib/data';
import { formatRelative } from '@/lib/format';
import { orNull } from '@/lib/data/safe';
import { presentOptions } from '@/lib/list-options';

const patch: Record<
  Device['patchStatus'],
  { tone: StatusTone; label: string }
> = {
  failed: { tone: 'failure', label: 'Failed' },
  pending: { tone: 'neutral', label: 'Pending' },
  current: { tone: 'positive', label: 'Up to date' },
};
const patchLabels = Object.fromEntries(
  Object.entries(patch).map(([status, { label }]) => [status, label]),
) as Record<Device['patchStatus'], string>;

const types: Record<Device['type'], string> = {
  workstation: 'Workstation',
  laptop: 'Laptop',
  server: 'Server',
  network: 'Network',
};

export async function generateMetadata({
  params,
}: PageProps<'/clients/[id]/devices'>) {
  const client = await getClient((await params).id).catch(orNull);
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
    getDevices({ clientId: client.id }).catch(orNull),
    getNow(),
    getWorkspace(),
  ]);

  const rows: DataRow[] = (devices ?? []).map((device) => ({
    id: device.id,
    text: [
      device.name,
      types[device.type],
      device.os,
      device.assignedTo,
      patch[device.patchStatus].label,
    ]
      .filter(Boolean)
      .join(' '),
    values: { patches: device.patchStatus, type: device.type },
    node: (
      <tr className="transition-colors hover:bg-surface-soft">
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
          {formatRelative(device.lastSeenAt, now, workspace.timeZone)}
        </td>
        <td className="px-4 py-2.5 whitespace-nowrap">
          <StatusDot
            tone={patch[device.patchStatus].tone}
            label={patch[device.patchStatus].label}
          />
        </td>
      </tr>
    ),
  }));

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
          <p className="mb-4 text-meta text-muted">
            From NinjaOne. Devices that need work are listed first.
          </p>
          <DataList
            rows={rows}
            noun={['device', 'devices']}
            placeholder="Search name, system, user"
            filters={[
              {
                name: 'patches',
                label: 'Patches',
                options: presentOptions(
                  devices.map((d) => d.patchStatus),
                  patchLabels,
                ),
              },
              {
                name: 'type',
                label: 'Type',
                as: 'menu',
                options: presentOptions(
                  devices.map((d) => d.type),
                  types,
                ),
              },
            ]}
            layout={{
              kind: 'table',
              caption: `Devices at ${client.name}, devices needing work first`,
              head: (
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
              ),
            }}
          />
        </>
      )}
    </ClientSheet>
  );
}
