import { hasRole } from '@dossierhq/contracts';
import {
  ClientTab,
  ReadFailed,
  clientTabMetadata,
} from '@/components/clients/client-tab';
import { ContractView } from '@/components/clients/contract-view';
import { contractView, documentRows } from '@/lib/contract-views';
import { getContractDocuments } from '@/lib/data/contracts';
import { orNull } from '@/lib/data/safe';

export const generateMetadata = ({
  params,
}: PageProps<'/clients/[id]/contract'>) =>
  clientTabMetadata(params, 'Contract');

/** The client's contract: its terms, and the files kept with it. */
export default function ContractPage({
  params,
}: PageProps<'/clients/[id]/contract'>) {
  return (
    <ClientTab
      params={params}
      render={async (client, context) => {
        const documents = await getContractDocuments(client.id).catch(orNull);
        if (documents === null) {
          return <ReadFailed what="this client’s contract files" />;
        }
        return (
          <ContractView
            clientId={client.id}
            clientName={client.name}
            contract={
              client.contract ? contractView(client.contract, context) : null
            }
            files={documentRows(documents, context)}
            canChange={hasRole(context.role, 'admin')}
          />
        );
      }}
    />
  );
}
