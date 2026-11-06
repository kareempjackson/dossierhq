import { hasRole } from '@dossierhq/contracts';
import {
  ClientTab,
  ReadFailed,
  clientTabMetadata,
} from '@/components/clients/client-tab';
import { ReportsView } from '@/components/clients/reports-view';
import { reportRows, sendsOn } from '@/lib/client-views';
import {
  getRecipients,
  getReportSettings,
  getReportSummaries,
} from '@/lib/data/client-records';
import { orNull } from '@/lib/data/safe';

export const generateMetadata = ({
  params,
}: PageProps<'/clients/[id]/reports'>) => clientTabMetadata(params, 'Reports');

/** The client's weekly reports, and who they go to. */
export default function ReportsPage({
  params,
}: PageProps<'/clients/[id]/reports'>) {
  return (
    <ClientTab
      params={params}
      render={async (client, context) => {
        const [reports, recipients, settings] = await Promise.all([
          getReportSummaries(client.id).catch(orNull),
          getRecipients(client.id).catch(orNull),
          getReportSettings().catch(orNull),
        ]);
        if (reports === null || recipients === null) {
          return <ReadFailed what="this client’s reports" />;
        }
        return (
          <ReportsView
            clientId={client.id}
            reports={reportRows(reports, context)}
            recipients={recipients}
            canChange={hasRole(context.role, 'admin')}
            sends={settings ? sendsOn(settings) : undefined}
          />
        );
      }}
    />
  );
}
