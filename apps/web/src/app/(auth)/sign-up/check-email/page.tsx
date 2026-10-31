import { MailCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AuthCard, SignUpSteps, TextLink } from '@/components/auth/auth-card';
import { ResendLink } from '@/components/auth/resend-link';
import { Skeleton } from '@/components/ui/states';
import { pendingSignUp } from '@/lib/sign-up';

export const metadata: Metadata = { title: 'Check your inbox' };

/** After signing up: the link is on its way, and what to do if it isn't. */
export default function CheckEmailPage() {
  return (
    <AuthCard
      title="Check your inbox"
      description="Open the link we sent to confirm your email. It works for 24 hours."
      footer={
        <>
          Wrong address? <TextLink href="/sign-up">Start again</TextLink>
        </>
      }
    >
      <SignUpSteps current={1} />
      <Suspense fallback={<Skeleton className="mt-6 h-40 w-full" />}>
        <Sent />
      </Suspense>
    </AuthCard>
  );
}

async function Sent() {
  const pending = await pendingSignUp();
  if (!pending) redirect('/sign-up');
  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex items-center gap-4 rounded-tile bg-brand-soft px-4 py-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sheet text-brand shadow-card">
          <MailCheck aria-hidden className="size-5" strokeWidth={1.75} />
        </span>
        <p className="min-w-0 text-body text-ink">
          We sent a link to{' '}
          <span className="font-medium break-all">{pending.email}</span>.
        </p>
      </div>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-meta text-text marker:text-muted">
        <li>
          Open it in this browser to carry straight on. Anywhere else, you’ll be
          asked for your password.
        </li>
        <li>
          Can’t see it? Look in spam or promotions for an email from Dossier.
        </li>
      </ul>
      <ResendLink />
    </div>
  );
}
