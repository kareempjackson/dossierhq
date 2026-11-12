'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
  useTransition,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { ButtonLink } from '@/components/ui/button';
import { cn } from '@/lib/cn';

type AuditNav = {
  /** The view being opened, until it's on screen. */
  pending: string | null;
  go: (href: string) => void;
};

const AuditNavContext = createContext<AuditNav>({
  pending: null,
  go: () => {},
});

/**
 * Moving between the audit log's tabs and pages. Each move is a transition,
 * so the page knows it's on its way: the tab lights and the entries dim on
 * the click, and the old entries stay until the new ones are ready. Lives in
 * the audit log's layout, so it outlasts each page it opens.
 */
export function AuditNavProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [target, setTarget] = useState<string | null>(null);

  const go = useCallback(
    (href: string) => {
      setTarget(href);
      startTransition(() => router.push(href));
    },
    [router],
  );
  const value = useMemo(
    () => ({ pending: isPending ? target : null, go }),
    [isPending, target, go],
  );
  return <AuditNavContext value={value}>{children}</AuditNavContext>;
}

export const useAuditNav = () => use(AuditNavContext);

type LinkProps = Omit<ComponentProps<typeof Link>, 'href' | 'onNavigate'> & {
  href: string;
};

/**
 * A link to another view or page of the audit log. Opening it in a new tab
 * works as usual; in this one it moves through AuditNavProvider.
 */
export function AuditLink({ href, ...props }: LinkProps) {
  const { go } = useAuditNav();
  return (
    <Link
      href={href}
      {...props}
      onNavigate={(event) => {
        event.preventDefault();
        go(href);
      }}
    />
  );
}

/** AuditLink, drawn as a button (Newer and Older). */
export function AuditButtonLink({
  href,
  ...props
}: Omit<ComponentProps<typeof ButtonLink>, 'href' | 'onNavigate'> & {
  href: string;
}) {
  const { go } = useAuditNav();
  return (
    <ButtonLink
      href={href}
      {...props}
      onNavigate={(event) => {
        event.preventDefault();
        go(href);
      }}
    />
  );
}

/**
 * The entries. While the next view loads they stay, dimmed, instead of
 * vanishing; the dimming waits a moment, so a quick answer doesn't flicker.
 */
export function AuditEntries({ children }: { children: ReactNode }) {
  const { pending } = useAuditNav();
  return (
    <div
      aria-busy={pending ? true : undefined}
      className={cn(
        pending && 'opacity-45 transition-opacity delay-75 duration-200',
      )}
    >
      {children}
    </div>
  );
}
