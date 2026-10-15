import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { SetupForm } from '@/components/auth/setup-form';
import { Skeleton } from '@/components/ui/states';
import { getSetupNeeded } from '@/lib/data';

export const metadata: Metadata = { title: 'Set up Dossier' };

/** First run only: creates the workspace and its owner. */
export default function SetupPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <p className="mb-6 text-center text-wordmark font-semibold text-ink">
          Dossier
        </p>
        <div className="rounded-card bg-sheet p-6 shadow-sheet sm:p-8">
          <h1 className="text-title-compact">Set up Dossier</h1>
          <p className="mt-2 text-text">
            Create a workspace for your company and an account for yourself.
            You’ll connect your tools next.
          </p>
          <Suspense fallback={<SetupFormSkeleton />}>
            <Setup />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

async function Setup() {
  // Once anyone has an account, this page is closed for good. If the API
  // can't be reached, show the form; submitting it will say so.
  if (!(await getSetupNeeded().catch(() => true))) redirect('/sign-in');

  const zones = Intl.supportedValuesOf('timeZone');
  return (
    <SetupForm timeZones={zones.includes('UTC') ? zones : ['UTC', ...zones]} />
  );
}

function SetupFormSkeleton() {
  return (
    <div aria-hidden className="mt-6 flex flex-col gap-4">
      {[0, 1, 2, 3, 4].map((row) => (
        <Skeleton key={row} className="h-16 w-full" />
      ))}
      <Skeleton className="h-10 w-full rounded-full" />
    </div>
  );
}
