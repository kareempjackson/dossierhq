import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SignInForm } from '@/components/auth/sign-in-form';
import { Skeleton } from '@/components/ui/states';
import { safeNextPath } from '@/lib/session';

export const metadata: Metadata = { title: 'Sign in' };

/** A single card on the ground; the form streams in once the URL is read. */
export default function SignInPage({ searchParams }: PageProps<'/sign-in'>) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-wordmark font-semibold text-ink">
          Dossier
        </p>
        <div className="rounded-card bg-sheet p-6 shadow-sheet sm:p-8">
          <h1 className="text-title-compact">Sign in</h1>
          <p className="mt-2 text-text">
            What needs attention at every client, and why.
          </p>
          <Suspense fallback={<SignInFormSkeleton />}>
            <SignIn searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

async function SignIn({
  searchParams,
}: Pick<PageProps<'/sign-in'>, 'searchParams'>) {
  const params = await searchParams;
  // Read per request (after searchParams), so the demo box follows the env.
  const email = process.env.DEMO_ACCOUNT_EMAIL;
  const password = process.env.DEMO_ACCOUNT_PASSWORD;

  return (
    <SignInForm
      next={safeNextPath(params.next)}
      expired={params.expired === '1'}
      demo={email && password ? { email, password } : null}
    />
  );
}

function SignInFormSkeleton() {
  return (
    <div aria-hidden className="mt-6 flex flex-col gap-4">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-9 w-full rounded-full" />
    </div>
  );
}
