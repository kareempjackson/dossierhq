import { Suspense, type ReactNode } from 'react';
import { ReportsShell } from '@/components/reports/reports-shell';
import { ReportsSync } from '@/components/reports/reports-sync';
import { getMe } from '@/lib/data/auth';
import { getReportSettings } from '@/lib/data/client-records';
import { getClientNames } from '@/lib/data/clients';
import {
  getOutbox,
  getReportQueue,
  getReportQuestions,
} from '@/lib/data/reports';
import { orNull } from '@/lib/data/safe';
import { reportsData } from '@/lib/report-views';

/**
 * Every Reports tab: the header, tabs and sheet. The week, the drafts to
 * review and the tabs' counts are read here, once, and handed to the
 * browser's store; each refresh after a change replaces them in place.
 */
export default function ReportsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <LoadReports />
      </Suspense>
      <ReportsShell>{children}</ReportsShell>
    </>
  );
}

async function LoadReports() {
  const [me, queue, outbox, questions, settings, names] = await Promise.all([
    getMe().catch(orNull),
    getReportQueue().catch(orNull),
    getOutbox().catch(orNull),
    getReportQuestions().catch(orNull),
    getReportSettings().catch(orNull),
    getClientNames().catch(orNull),
  ]);
  if (!me || !queue || !outbox || !questions) {
    return <ReportsSync data={null} />;
  }
  return (
    <ReportsSync
      data={reportsData(
        {
          queue,
          outbox,
          questions,
          settings,
          names: names ?? new Map(),
        },
        { timeZone: me.workspace.timeZone, now: new Date() },
      )}
    />
  );
}
