import {
  ClientTab,
  ReadFailed,
  clientTabMetadata,
} from '@/components/clients/client-tab';
import { DevicesView } from '@/components/clients/devices-view';
import { deviceRows } from '@/lib/client-views';
import {
  getAttention,
  getDevices,
  getEndUsers,
  getRecommendations,
  getSources,
} from '@/lib/data/client-records';
import { orNull } from '@/lib/data/safe';

export const generateMetadata = ({
  params,
}: PageProps<'/clients/[id]/devices'>) => clientTabMetadata(params, 'Devices');

/** The client's devices; choosing one opens its detail panel. */
export default function DevicesPage({
  params,
}: PageProps<'/clients/[id]/devices'>) {
  return (
    <ClientTab
      params={params}
      render={async (client, context) => {
        const [devices, attention, drafts, users] = await Promise.all([
          getDevices(client.id).catch(orNull),
          getAttention(client.id).catch(orNull),
          getRecommendations(client.id, 'draft').catch(orNull),
          getEndUsers(client.id).catch(orNull),
        ]);
        if (devices === null) {
          return <ReadFailed what="this client’s devices" />;
        }
        const sources =
          (await getSources(devices.map((device) => device.sourceId)).catch(
            orNull,
          )) ?? new Map();
        return (
          <DevicesView
            clientId={client.id}
            devices={deviceRows(
              {
                devices,
                sources,
                attention: attention ?? [],
                drafts: drafts ?? [],
                users: users ?? [],
              },
              context,
            )}
          />
        );
      }}
    />
  );
}
