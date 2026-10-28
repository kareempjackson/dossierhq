import Link from 'next/link';
import { Suspense } from 'react';
import { PreferenceToggles } from '@/components/intelligence/preference-toggles';
import { Sheet } from '@/components/ui/sheet';
import { ErrorState, LoadingLabel, Skeleton } from '@/components/ui/states';
import { getIntelligence, getMe } from '@/lib/data';
import { orNull } from '@/lib/data/safe';

export const metadata = { title: 'Intelligence' };

export default function IntelligencePage() {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto flex max-w-220 flex-col gap-12">
        <header>
          <h1 className="text-title-compact sm:text-title">Intelligence</h1>
          <p className="mt-3 max-w-2xl text-text">
            Choose what Dossier drafts with Claude, what it looks for, and which
            of your records Claude may read. Everything it drafts cites the
            records behind it and waits for your team to review. The model and
            what it costs are in{' '}
            <Link href="/settings" className="underline underline-offset-2">
              Settings
            </Link>
            .
          </p>
        </header>

        <Suspense fallback={<TogglesSkeleton />}>
          <Preferences />
        </Suspense>
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

  return (
    <>
      {!settings.enabled && (
        <p
          role="status"
          className="rounded-card bg-marker-highlight px-4 py-3 text-body text-ink"
        >
          Drafting is off until ANTHROPIC_API_KEY is set on the API. You can
          still choose what Dossier will do once it’s on.
        </p>
      )}
      <PreferenceToggles
        preferences={settings.preferences}
        canManage={me?.role === 'owner'}
        enabled={settings.enabled}
      />
    </>
  );
}

function TogglesSkeleton() {
  return (
    <div>
      <LoadingLabel what="intelligence settings" />
      <div className="flex flex-col divide-y divide-hairline rounded-card bg-sheet shadow-card">
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="flex items-center gap-4 px-4 py-4">
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-72 max-w-full" />
            </div>
            <Skeleton className="h-6 w-10 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
