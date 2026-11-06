import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { TextLink } from '@/components/ui/text-link';
import { LockedOutPanel } from '../forgot-password/locked-out-panel';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = {
  title: 'Choose a new password',
  // The token is in this page's URL; never pass it on to anyone else.
  referrer: 'no-referrer',
};

export default function ResetPasswordPage() {
  return (
    <AuthShell panel={<LockedOutPanel />}>
      <h1 className="text-h1">Choose a new password.</h1>
      <p className="mt-2 text-muted">
        Saving it signs you out of Dossier everywhere else.
      </p>
      <ResetPasswordForm />
      <p className="mt-6 text-small text-muted">
        Remembered it? <TextLink href="/sign-in">Sign in</TextLink>
      </p>
    </AuthShell>
  );
}
