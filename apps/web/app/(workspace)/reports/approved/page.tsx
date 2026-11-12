import type { Metadata } from 'next';
import { ReadFailed } from '@/components/clients/client-tab';
import { ApprovedView } from '@/components/reports/approved-view';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';
import { sendsOn } from '@/lib/client-views';
import { getMe } from '@/lib/data/auth';
import { getReportSettings } from '@/lib/data/client-records';
import { getClientNames } from '@/lib/data/clients';
import { getOutbox } from '@/lib/data/reports';
import { orNull } from '@/lib/data/safe';
import { outboxRows } from '@/lib/report-views';

export const metadata: Metadata = { title: 'Approved reports' };

/** Approved and waiting to go, from the last two weeks. */
export default function ApprovedPage() {
  return (
    <Reveal
      fallback={
        <IndexLoader className="h-64" label="Loading the approved reports" />
      }
    >
      <Approved />
    </Reveal>
  );
}

async function Approved() {
  const [me, outbox, names, settings] = await Promise.all([
    getMe(),
    getOutbox().catch(orNull),
    getClientNames().catch(orNull),
    getReportSettings().catch(orNull),
  ]);
  if (outbox === null) return <ReadFailed what="the approved reports" />;
  return (
    <ApprovedView
      rows={outboxRows(outbox, names ?? new Map(), {
        timeZone: me.workspace.timeZone,
        now: new Date(),
      })}
      sends={settings ? sendsOn(settings) : null}
    />
  );
}
