import type { ReactNode } from 'react';
import { ReportsShell } from '@/components/reports/reports-shell';
import { getWorkspace } from '@/lib/workspace';

/** Every Reports tab: the header, tabs and sheet, and this week's choices. */
export default function ReportsLayout({ children }: { children: ReactNode }) {
  const { weekly, clients } = getWorkspace();
  const names = new Map(clients.map((client) => [client.id, client.name]));
  return (
    <ReportsShell
      week={weekly.week}
      sends={weekly.sends}
      drafts={weekly.drafts.map((draft) => ({
        id: draft.id,
        clientName: names.get(draft.clientId) ?? draft.clientId,
        checks: draft.answers.filter((answer) => answer.check).length,
      }))}
      approvedCount={weekly.approved.length}
      initialQuestions={weekly.questions}
    >
      {children}
    </ReportsShell>
  );
}
