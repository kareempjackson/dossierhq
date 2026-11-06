import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { IllustratedPanel } from '@/components/auth/statement-panel';
import cards from '@/public/illustrations/18-model-cards 1.png';
import { RecoveryCodeForm } from './recovery-code-form';

export const metadata: Metadata = { title: 'Recovery code' };

export default function RecoveryCodePage() {
  return (
    <AuthShell
      panel={
        <IllustratedPanel
          tone="lilac"
          title={
            <>
              Ten keys
              <br />
              to your file.
            </>
          }
          body="Keep recovery codes somewhere safe, like your password manager."
          illustration={cards}
          illustrationClassName="top-[58%] left-[46%] w-[min(90%,85vh)] -translate-x-1/2 -translate-y-1/2"
        />
      }
    >
      <h1 className="text-h1">Use a recovery code.</h1>
      <p className="mt-2 text-muted">
        Each of your 10 recovery codes works once. Using one is always emailed
        to you.
      </p>
      <RecoveryCodeForm />
    </AuthShell>
  );
}
