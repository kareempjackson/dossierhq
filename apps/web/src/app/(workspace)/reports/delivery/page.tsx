import { hasRole } from '@dossierhq/contracts';
import { Suspense } from 'react';
import { DeliverySettings } from '@/components/report/delivery-settings';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Sheet } from '@/components/ui/sheet';
import { ErrorState, LoadingLabel, Skeleton } from '@/components/ui/states';
import { getMe, getReportSettings } from '@/lib/data';
import { orNull } from '@/lib/data/safe';

export const metadata = { title: 'Report delivery' };

export default function ReportDeliveryPage() {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto max-w-220">
        <Breadcrumb
          items={[
            { label: 'Reports', href: '/reports' },
            { label: 'Delivery' },
          ]}
        />
        <h1 className="mt-4 text-title-compact sm:text-title">
          Report delivery
        </h1>
        <p className="mt-3 max-w-160 text-meta text-muted">
          How weekly reports look in your clients’ inboxes, and when Dossier
          drafts and sends them. Nothing goes out until someone approves it. Who
          each report goes to is on the client’s Reports tab.
        </p>
        <div className="mt-8">
          <Suspense fallback={<DeliverySkeleton />}>
            <Delivery />
          </Suspense>
        </div>
      </div>
    </Sheet>
  );
}

async function Delivery() {
  const [settings, me] = await Promise.all([
    getReportSettings().catch(orNull),
    getMe().catch(orNull),
  ]);
  if (settings === null || me === null) {
    return <ErrorState what="how reports go out" />;
  }
  return (
    <DeliverySettings
      settings={settings}
      workspaceName={me.workspace.name}
      timeZone={me.workspace.timeZone}
      canManage={hasRole(me.role, 'admin')}
    />
  );
}

function DeliverySkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingLabel what="how reports go out" />
      <Skeleton className="h-28 w-full rounded-card" />
      <Skeleton className="h-96 w-full rounded-card" />
    </div>
  );
}
