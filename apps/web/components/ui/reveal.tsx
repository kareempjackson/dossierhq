import { Suspense, ViewTransition, type ReactNode } from 'react';
import { Cascade } from './cascade';

/**
 * Suspense for content that takes a moment to read. The fallback is an
 * IndexLoader the height of the content. When the content is ready, the
 * loader fades away (the `loader-out` view transition in globals.css) and
 * the content's sections spring in one after another (Cascade).
 *
 * Use it only when the fallback is a loader. A fallback that is the same UI
 * drawn before the URL is known stays a plain Suspense, so it doesn't
 * animate into itself.
 */
export function Reveal({
  fallback,
  children,
}: {
  /** An IndexLoader sized like the content it stands in for. */
  fallback: ReactNode;
  children: ReactNode;
}) {
  return (
    <Suspense fallback={<LoaderPart>{fallback}</LoaderPart>}>
      <RevealPart>{children}</RevealPart>
    </Suspense>
  );
}

/**
 * For a fallback that also draws real UI, such as the page's title: wrap
 * only the loader in this, and the matching content in RevealPart, so the
 * title holds still while the body arrives.
 */
export function LoaderPart({ children }: { children: ReactNode }) {
  return (
    <ViewTransition exit="loader-out" default="none">
      {children}
    </ViewTransition>
  );
}

/**
 * The content that takes a LoaderPart's place. It cascades in, and when
 * it's replaced, say by moving to another client tab, it dissolves instead
 * of vanishing (`content-out`).
 */
export function RevealPart({ children }: { children: ReactNode }) {
  // default="none" keeps refreshes (router.refresh) from re-animating it.
  // The transition sits outside the cascade, with no element between it and
  // the content: React only runs an exit for the outermost one.
  return (
    <ViewTransition exit="content-out" default="none">
      <Cascade>{children}</Cascade>
    </ViewTransition>
  );
}
