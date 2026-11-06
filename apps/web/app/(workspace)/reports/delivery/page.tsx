import type { Metadata } from 'next';
import { DeliverySettings } from '@/components/reports/delivery-settings';
import { getWorkspace } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Report delivery' };

export default function DeliveryPage() {
  const { weekly, clients } = getWorkspace();
  const sampleClient = clients.find(
    (client) => client.id === weekly.drafts[0]?.clientId,
  );
  return (
    <DeliverySettings
      defaults={weekly.delivery}
      sample={{
        clientName: sampleClient?.name ?? 'Your client',
        period: weekly.period,
      }}
    />
  );
}
