import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { IllustratedPanel } from '@/components/auth/statement-panel';
import glass from '@/public/illustrations/Illustration · 16-read-only-glass.png';
import { TwoFactorForm } from './two-factor-form';

export const metadata: Metadata = { title: 'Two-factor code' };

export default function TwoFactorPage() {
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
      <h1 className="text-h1">Enter your code.</h1>
      <p className="mt-2 text-muted">
        Open your authenticator app, such as 1Password or Google Authenticator,
        and type the 6-digit code for Dossier.
      </p>
      <TwoFactorForm />
    </AuthShell>
  );
}
