import type { Metadata } from 'next';
import { AuthCard, SignUpSteps, TextLink } from '@/components/auth/auth-card';
import { SignUpForm } from '@/components/auth/sign-up-form';

export const metadata: Metadata = { title: 'Create your account' };

/**
 * Anyone can sign up. The account, and its workspace, exist once the email
 * is confirmed; onboarding asks for everything else.
 */
export default function SignUpPage() {
  return (
    <AuthCard
      title="Create your account"
      description="Start with your email and a password. Once you’ve confirmed your email, Dossier walks you through setting up your workspace."
      footer={
        <>
          Already have an account? <TextLink href="/sign-in">Sign in</TextLink>
        </>
      }
    >
      <SignUpSteps current={0} />
      <SignUpForm />
    </AuthCard>
  );
}
