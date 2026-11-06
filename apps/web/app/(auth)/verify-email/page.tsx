import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { IllustratedPanel } from '@/components/auth/statement-panel';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';
import { SIGN_UP_STEPS, StepTabs } from '@/components/ui/step-tabs';
import { pendingSignUp } from '@/lib/sign-up';
import inbox from '@/public/illustrations/13-inbox-tray 1.png';
import { ConfirmEmailForm } from './confirm-email-form';

export const metadata: Metadata = {
  title: 'Confirm your email',
  // The token is in this page's URL; never pass it on to anyone else.
  referrer: 'no-referrer',
  robots: { index: false },
};

/**
 * Where the sign-up email's link opens (`?token=`). Confirming is a button,
 * not the page load, because mail scanners open links too.
 */
export default function VerifyEmailPage({
  searchParams,
}: PageProps<'/verify-email'>) {
  return (
    <AuthShell
      panel={
        <IllustratedPanel
          tone="lilac"
          title={
            <>
              One click
              <br />
              and it’s yours.
            </>
          }
          body="Next, Dossier helps you name your workspace and connect your first tool."
          illustration={inbox}
          illustrationClassName="top-[68%] left-[51%] w-[min(98%,85vh)] -translate-x-1/2 -translate-y-1/2"
        />
      }
    >
      <StepTabs steps={SIGN_UP_STEPS} current={1} />
      <h1 className="mt-8 text-h1">Confirm your email.</h1>
      <Reveal fallback={<IndexLoader className="h-32" />}>
        <Confirm searchParams={searchParams} />
      </Reveal>
    </AuthShell>
  );
}

async function Confirm({
  searchParams,
}: Pick<PageProps<'/verify-email'>, 'searchParams'>) {
  const [{ token: raw }, pending] = await Promise.all([
    searchParams,
    pendingSignUp(),
  ]);
  const token = typeof raw === 'string' ? raw : '';
  return (
    <ConfirmEmailForm
      token={token}
      email={pending?.email ?? null}
      // The browser that signed up has the key, so no password is needed.
      sameBrowser={Boolean(pending)}
    />
  );
}
