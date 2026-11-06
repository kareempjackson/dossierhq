import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { SIGN_UP_STEPS, StepTabs } from '@/components/ui/step-tabs';
import { TextLink } from '@/components/ui/text-link';
import { Suspense } from 'react';
import { SignUpForm, SignUpFormFromUrl } from './sign-up-form';
import { SignUpPanel } from './sign-up-panel';

export const metadata: Metadata = { title: 'Create your account' };

export default function SignUpPage() {
  return (
    <AuthShell panel={<SignUpPanel />}>
      <StepTabs steps={SIGN_UP_STEPS} current={0} />
      <h1 className="mt-8 text-h1">Create your account.</h1>
      <p className="mt-2 text-muted">
        Start with your email and a password. Once you’ve confirmed your email,
        Dossier walks you through setting up your workspace.
      </p>
      <Suspense fallback={<SignUpForm />}>
        <SignUpFormFromUrl />
      </Suspense>
      <p className="mt-6 text-small text-muted">
        Already have an account? <TextLink href="/sign-in">Sign in</TextLink>
      </p>
    </AuthShell>
  );
}
