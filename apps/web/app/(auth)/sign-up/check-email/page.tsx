import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { IllustratedPanel } from '@/components/auth/statement-panel';
import { ButtonLink } from '@/components/ui/button';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';
import { SIGN_UP_STEPS, StepTabs } from '@/components/ui/step-tabs';
import { TextLink } from '@/components/ui/text-link';
import { mailAppFor } from '@/lib/mail-app';
import { pendingSignUp } from '@/lib/sign-up';
import inbox from '@/public/illustrations/13-inbox-tray 1.png';
import { ResendButton } from './resend-button';

export const metadata: Metadata = { title: 'Check your inbox' };

/**
 * When the emailed link arrives broken, the page it opens sends people back
 * here with `?link=` to say why; the resend button is right above.
 */
const LINK_PROBLEMS: Record<string, { title: string; body: string }> = {
  incomplete: {
    title: 'This link is incomplete',
    body: 'Copy the whole link from the email, or send a new one.',
  },
  expired: {
    title: 'This link has run out',
    body: 'Links work for 24 hours. Send a new one.',
  },
};

export default function CheckEmailPage({
  searchParams,
}: PageProps<'/sign-up/check-email'>) {
  return (
    <AuthShell
      panel={
        <IllustratedPanel
          tone="lilac"
          title={
            <>
              Your file is
              <br />
              almost open.
            </>
          }
          body="Next, Dossier helps you name your workspace and connect your first tool."
          illustration={inbox}
          illustrationClassName="top-[68%] left-[51%] w-[min(98%,85vh)] -translate-x-1/2 -translate-y-1/2"
        />
      }
    >
      <StepTabs steps={SIGN_UP_STEPS} current={1} />
      <h1 className="mt-8 text-h1">Check your inbox.</h1>
      <Reveal fallback={<IndexLoader className="h-28" />}>
        <Sent searchParams={searchParams} />
      </Reveal>
      <p className="mt-6 text-small text-muted">
        Wrong address? <TextLink href="/sign-up">Start again</TextLink>
      </p>
    </AuthShell>
  );
}

async function Sent({
  searchParams,
}: Pick<PageProps<'/sign-up/check-email'>, 'searchParams'>) {
  const pending = await pendingSignUp();
  if (!pending) redirect('/sign-up');
  const [mailApp, { link }] = await Promise.all([
    mailAppFor(pending.email),
    searchParams,
  ]);
  const problem = typeof link === 'string' ? LINK_PROBLEMS[link] : undefined;

  return (
    <>
      <p className="mt-2 text-muted">
        We sent a link to{' '}
        <strong className="font-semibold [overflow-wrap:anywhere] text-ink">
          {pending.email}
        </strong>
        . One more click and your account is ready.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        {mailApp && (
          <ButtonLink
            href={mailApp.href}
            target="_blank"
            rel="noopener noreferrer"
            variant="ink"
          >
            Open {mailApp.name}
          </ButtonLink>
        )}
        <ResendButton />
      </div>
      {problem && (
        <div
          role="alert"
          className="mt-8 rounded-2xl bg-attention-soft p-5 text-attention"
        >
          <p className="font-medium">{problem.title}</p>
          <p className="mt-1 text-small">{problem.body}</p>
        </div>
      )}
    </>
  );
}
