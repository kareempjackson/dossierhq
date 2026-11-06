import type { Metadata } from 'next';
import { ApprovedView } from '@/components/reports/approved-view';
import { getWorkspace } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Approved reports' };

export default function ApprovedPage() {
  const { weekly, clients } = getWorkspace();
  return (
    <ApprovedView
      approved={weekly.approved}
      clientNames={Object.fromEntries(
        clients.map((client) => [client.id, client.name]),
      )}
      sends={weekly.sends}
    />
  );
}
