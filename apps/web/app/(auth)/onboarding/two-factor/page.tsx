import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { IllustratedPanel } from '@/components/auth/statement-panel';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';
import { SIGN_UP_STEPS, StepTabs } from '@/components/ui/step-tabs';
import { getMe, getTwoFactor } from '@/lib/data/auth';
import { safeNextPath } from '@/lib/safe-next-path';
import glass from '@/public/illustrations/Illustration · 16-read-only-glass.png';
import { FinishSetUp } from './finish-set-up';

export const metadata: Metadata = { title: 'Turn on two-factor sign-in' };

/**
 * The second half of setting up: two-factor sign-in, which every new
 * account keeps on, then finishing. Also where an account that must keep it
 * on comes back to after turning it off.
 */
export default function OnboardingTwoFactorPage({
  searchParams,
}: PageProps<'/onboarding/two-factor'>) {
  return (
    <AuthShell
      panel={
        <IllustratedPanel
          tone="lilac"
          title={
            <>
              Only you
              <br />
              open this file.
            </>
          }
          body="Two-factor sign-in keeps your workspace closed, even if a password leaks."
          illustration={glass}
          illustrationClassName="top-[63%] left-1/2 w-[min(96%,85vh)] -translate-x-1/2 -translate-y-1/2"
        />
      }
    >
      <Reveal fallback={<IndexLoader className="h-[24.5rem]" />}>
        <Secure searchParams={searchParams} />
      </Reveal>
    </AuthShell>
  );
}

async function Secure({
  searchParams,
}: Pick<PageProps<'/onboarding/two-factor'>, 'searchParams'>) {
  const [me, status, { next }] = await Promise.all([
    getMe(),
    getTwoFactor(),
    searchParams,
  ]);
  if (me.setup === 'done') redirect('/');
  const again = me.setup === 'two-factor';

  return (
    <>
      {me.role === 'owner' && !again && (
        <div className="mb-8">
          <StepTabs steps={SIGN_UP_STEPS} current={2} />
        </div>
      )}
      <h1 className="text-h1">
        {again ? 'Set up two-factor sign-in again.' : 'Protect your account.'}
      </h1>
      <p className="mt-2 text-muted">
        {again
          ? 'Your account keeps two-factor sign-in on. Set it up with your new phone or app to carry on.'
          : 'Dossier holds what your clients’ systems need, so every account signs in with a code from an authenticator app as well as a password.'}
      </p>
      <FinishSetUp
        email={me.user.email}
        available={status.available}
        enabled={status.enabled}
        next={safeNextPath(next)}
      />
    </>
  );
}
