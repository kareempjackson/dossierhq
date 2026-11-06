import {
  ClientTab,
  ReadFailed,
  clientTabMetadata,
} from '@/components/clients/client-tab';
import { FilesView } from '@/components/clients/files-view';
import { clientFiles } from '@/lib/client-views';
import { getClientSources } from '@/lib/data/client-records';
import { getConnectors } from '@/lib/data/connectors';
import { orNull } from '@/lib/data/safe';

export const generateMetadata = ({
  params,
}: PageProps<'/clients/[id]/files'>) => clientTabMetadata(params, 'Files');

/** The client's SharePoint folder, by subfolder. */
export default function FilesPage({
  params,
}: PageProps<'/clients/[id]/files'>) {
  return (
    <ClientTab
      params={params}
      render={async (client, context) => {
        const [sources, connectors] = await Promise.all([
          getClientSources(client.id).catch(orNull),
          getConnectors().catch(orNull),
        ]);
        if (sources === null || connectors === null) {
          return <ReadFailed what="this client’s files" />;
        }
        return (
          <FilesView
            clientName={client.name}
            files={clientFiles(
              sources,
              connectors.find((connector) => connector.tool === 'sharepoint'),
              context,
            )}
          />
        );
      }}
    />
  );
}
