'use client';

import Link from 'next/link';
import { useAppSelector } from '@/lib/store/hooks';
import { selectUser } from '@/lib/store/session-slice';

/** Who's signed in, at the foot of the sidebar; room kept for it until known. */
export function SidebarUser() {
  const user = useAppSelector(selectUser);
  return (
    <Link
      href="/settings"
      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/60"
    >
      {user ? (
        <>
          <span
            aria-hidden
            className="grid size-8 shrink-0 animate-enter place-items-center rounded-full bg-ink text-[0.6875rem] font-medium text-paper"
          >
            {initials(user.name)}
          </span>
          <span className="animate-enter truncate text-small font-medium">
            {user.name}
          </span>
        </>
      ) : (
        <>
          <span aria-hidden className="size-8 shrink-0" />
          <span aria-hidden className="h-3 w-24" />
          <span className="sr-only">Your account</span>
        </>
      )}
    </Link>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');
}
