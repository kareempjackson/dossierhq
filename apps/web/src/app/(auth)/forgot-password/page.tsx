import type { Metadata } from 'next';
import { AuthCard, TextLink } from '@/components/auth/auth-card';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export const metadata: Metadata = { title: 'Reset your password' };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="Enter the email you sign in with, and Dossier will send you a link to choose a new password."
      footer={
        <>
          Remembered it? <TextLink href="/sign-in">Sign in</TextLink>
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
