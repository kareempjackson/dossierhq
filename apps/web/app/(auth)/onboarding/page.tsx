import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { IllustratedPanel } from '@/components/auth/statement-panel';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';
import { SIGN_UP_STEPS, StepTabs } from '@/components/ui/step-tabs';
import { getMe, getOnboarding } from '@/lib/data/auth';
import workspace from '@/public/illustrations/Illustration · 24-workspace-build.png';
import { NameForm } from './name-form';
import { SetUpForm } from './set-up-form';

export const metadata: Metadata = { title: 'Set up your workspace' };

/**
 * The first half of setting up: the owner names the workspace and picks a
 * tool; someone invited gives their name. Two-factor sign-in comes next.
 */
export default function OnboardingPage() {
  return (
    <AuthShell
      panel={
        <IllustratedPanel
          tone="stone"
          title={
            <>
              Read it.
              <br />
              Cite it.
              <br />
              Act on it.
            </>
          }
          body="Your first sync reads every client in a few minutes."
          illustration={workspace}
          illustrationClassName="bottom-0 left-[54%] w-[min(92%,78vh)] -translate-x-1/2"
        />
      }
    >
      <Reveal fallback={<IndexLoader className="h-[21.5rem]" />}>
        <SetUp />
      </Reveal>
    </AuthShell>
  );
}

async function SetUp() {
  const me = await getMe();
  if (me.setup === 'done') redirect('/');
  // Two-factor was turned off on an account that must keep it on.
  if (me.setup === 'two-factor') redirect('/onboarding/two-factor');

  if (me.role !== 'owner') {
    return (
      <>
        <h1 className="text-h1">Set up your account.</h1>
        <p className="mt-2 text-muted">
          You’re joining {me.workspace.name}. This is the name your team will
          see.
        </p>
        <NameForm defaultName={me.user.name} />
      </>
    );
  }

  const { company } = await getOnboarding();
  return (
    <>
      <StepTabs steps={SIGN_UP_STEPS} current={2} />
      <h1 className="mt-8 text-h1">Set up your workspace.</h1>
      <p className="mt-2 text-muted">
        This is how your team and your clients will see you.
      </p>
      <SetUpForm
        defaultName={company.name}
        defaultTimeZone={company.timeZone}
      />
    </>
  );
}
