import type { ReactNode } from 'react';

type AuthCardProps = {
  title: string;
  description: string;
  /** For longer forms. */
  wide?: boolean;
  children: ReactNode;
};

/** Signing in and joining: the wordmark, then one card on the ground. */
export function AuthCard({
  title,
  description,
  wide = false,
  children,
}: AuthCardProps) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className={wide ? 'w-full max-w-md' : 'w-full max-w-sm'}>
        <p className="mb-6 flex items-center justify-center gap-2">
          <span className="text-wordmark font-semibold text-ink">Dossier</span>
          <span className="rounded-full bg-night px-2.5 py-0.5 text-meta-sm font-medium text-mint">
            Admin
          </span>
        </p>
        <div className="rounded-card bg-sheet p-6 shadow-sheet sm:p-8">
          <h1 className="text-title-compact">{title}</h1>
          <p className="mt-2 text-text">{description}</p>
          {children}
        </div>
        <p className="mt-6 text-center text-meta text-muted-on-ground">
          For Dossier’s staff only. Every sign-in is logged.
        </p>
      </div>
    </main>
  );
}
