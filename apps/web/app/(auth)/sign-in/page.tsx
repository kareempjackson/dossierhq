import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { TextLink } from '@/components/ui/text-link';
import { SignInForm } from './sign-in-form';
import { SignInPanel } from './sign-in-panel';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage() {
  return (
    <AuthShell panel={<SignInPanel />}>
      <h1 className="text-h1">Welcome back.</h1>
      <p className="mt-2 text-muted">Sign in to read your client files.</p>
      <SignInForm />
      <p className="mt-6 text-small text-muted">
        New to Dossier? <TextLink href="/sign-up">Create an account</TextLink>
      </p>
    </AuthShell>
  );
}
