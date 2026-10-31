import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCard, SignUpSteps, TextLink } from '@/components/auth/auth-card';
import { ConfirmEmailForm } from '@/components/auth/confirm-email-form';
import { Skeleton } from '@/components/ui/states';
import { pendingSignUp } from '@/lib/sign-up';

export const metadata: Metadata = {
  title: 'Confirm your email',
  // The token is in this page's URL; never pass it on to anyone else.
  referrer: 'no-referrer',
};

const signIn = (
  <>
    Already confirmed? <TextLink href="/sign-in">Sign in</TextLink>
  </>
);

/** Where the sign-up email's link lands. */
export default function VerifyEmailPage({
  searchParams,
}: PageProps<'/verify-email'>) {
  return (
    <AuthCard
      title="Confirm your email"
      description="One more click and your account is ready. Next, Dossier helps you set up your workspace."
      footer={signIn}
    >
      <SignUpSteps current={1} />
      <Suspense
        fallback={<Skeleton className="mt-6 h-10 w-full rounded-full" />}
      >
        <Confirm searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function Confirm({
  searchParams,
}: Pick<PageProps<'/verify-email'>, 'searchParams'>) {
  const { token } = await searchParams;
  if (typeof token !== 'string' || !token) {
    return (
      <p role="alert" className="mt-6 text-body text-text">
        This link is incomplete. Copy the whole link from the email, or{' '}
        <TextLink href="/sign-up">sign up again</TextLink> for a new one.
      </p>
    );
  }
  return (
    <ConfirmEmailForm
      token={token}
      sameBrowser={(await pendingSignUp()) !== null}
    />
  );
}
