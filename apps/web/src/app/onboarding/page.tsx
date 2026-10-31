import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow';
import { Skeleton } from '@/components/ui/states';
import {
  getInvites,
  getMe,
  getOnboarding,
  getReportSettings,
  getTwoFactor,
} from '@/lib/data';

export const metadata: Metadata = { title: 'Set up Dossier' };

const zones = Intl.supportedValuesOf('timeZone');
const timeZones = zones.includes('UTC') ? zones : ['UTC', ...zones];

/**
 * After confirming an email or accepting an invite, and again for someone
 * who must set two-factor up again. Everyone else goes home.
 */
export default function OnboardingPage({
  searchParams,
}: PageProps<'/onboarding'>) {
  return (
    <Suspense fallback={<OnboardingSkeleton />}>
      <Onboarding searchParams={searchParams} />
    </Suspense>
  );
}

async function Onboarding({
  searchParams,
}: Pick<PageProps<'/onboarding'>, 'searchParams'>) {
  const me = await getMe();
  if (me.setup === 'done') redirect('/');
  const owner = me.setup === 'onboarding' && me.role === 'owner';
  const [onboarding, twoFactor, settings, invites, { step }] =
    await Promise.all([
      getOnboarding(),
      getTwoFactor(),
      owner ? getReportSettings() : null,
      owner ? getInvites() : [],
      searchParams,
    ]);
  return (
    <OnboardingFlow
      me={me}
      onboarding={onboarding}
      twoFactor={twoFactor}
      settings={settings}
      invites={invites}
      timeZones={
        timeZones.includes(onboarding.company.timeZone)
          ? timeZones
          : [onboarding.company.timeZone, ...timeZones]
      }
      initialStep={typeof step === 'string' ? step : undefined}
    />
  );
}

function OnboardingSkeleton() {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]">
      <div className="h-24 bg-night lg:h-dvh" />
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-16">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="mt-6 h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}
