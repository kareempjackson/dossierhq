import { hasRole } from '@dossierhq/contracts';
import { Lock } from 'lucide-react';
import { Suspense } from 'react';
import { DraftingStatus } from '@/components/intelligence/drafting-status';
import { PreferenceToggles } from '@/components/intelligence/preference-toggles';
import { Sheet } from '@/components/ui/sheet';
import { ErrorState, LoadingLabel, Skeleton } from '@/components/ui/states';
import { getIntelligence, getMe } from '@/lib/data';
import { orNull } from '@/lib/data/safe';

export const metadata = { title: 'Intelligence' };

export default function IntelligencePage() {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto max-w-220">
        <header className="max-w-2xl">
          <h1 className="text-title-compact sm:text-title">Intelligence</h1>
          <p className="mt-3 text-text">
            Choose what Dossier drafts with Claude, what it looks for, and which
            of your records Claude may read. Everything it drafts cites the
            records behind it and waits for your team to review.
          </p>
        </header>

        <div className="mt-8 xl:mt-10">
          <Suspense fallback={<PreferencesSkeleton />}>
            <Preferences />
          </Suspense>
        </div>
      </div>
    </Sheet>
  );
}

async function Preferences() {
  const [settings, me] = await Promise.all([
    getIntelligence().catch(orNull),
    getMe().catch(orNull),
  ]);
  if (settings === null)
    return <ErrorState what="your intelligence settings" />;
  const canManage = hasRole(me?.role, 'admin');

  return (
    <div className="flex flex-col gap-14">
      <div className="flex flex-col gap-3">
        <DraftingStatus settings={settings} />
        {!canManage && (
          <p className="flex items-center gap-2.5 rounded-card bg-surface px-4 py-3 text-meta text-text">
            <Lock
              aria-hidden
              className="size-4 shrink-0 text-muted"
              strokeWidth={1.75}
            />
            Only owners and admins can change what Dossier drafts and reads.
          </p>
        )}
      </div>
      <PreferenceToggles
        preferences={settings.preferences}
        canManage={canManage}
        enabled={settings.enabled}
      />
    </div>
  );
}

function PreferencesSkeleton() {
  return (
    <div className="flex flex-col gap-14">
      <LoadingLabel what="intelligence settings" />
      <div className="rounded-card bg-sheet shadow-card">
        <div className="flex items-center gap-5 p-5">
          <Skeleton className="size-11 rounded-tile" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="grid grid-cols-3 border-t border-hairline">
          {[0, 1, 2].map((figure) => (
            <div key={figure} className="flex flex-col gap-2 px-5 py-3.5">
              <Skeleton className="h-3 w-20 max-w-full" />
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-64 max-w-full" />
        </div>
        <div className="divide-y divide-hairline rounded-card bg-sheet shadow-card">
          {[0, 1].map((row) => (
            <div key={row} className="flex items-start gap-4 px-5 py-4">
              <Skeleton className="size-9 rounded-tile" />
              <div className="flex flex-1 flex-col gap-2 pt-0.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-72 max-w-full" />
              </div>
              <Skeleton className="mt-1.5 h-6 w-10 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
