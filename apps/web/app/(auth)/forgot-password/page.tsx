import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { TextLink } from '@/components/ui/text-link';
import { ForgotPasswordForm } from './forgot-password-form';
import { LockedOutPanel } from './locked-out-panel';

export const metadata: Metadata = { title: 'Reset your password' };

export default function ForgotPasswordPage() {
  return (
    <AuthShell panel={<LockedOutPanel />}>
      <h1 className="text-h1">Reset your password.</h1>
      <p className="mt-2 text-muted">
        We’ll email a link to choose a new one. Using it signs you out
        everywhere else.
      </p>
      <ForgotPasswordForm />
      <p className="mt-6 text-small text-muted">
        Remembered it? <TextLink href="/sign-in">Sign in</TextLink>
      </p>
    </AuthShell>
  );
}
