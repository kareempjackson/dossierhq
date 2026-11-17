'use client';

import { Eye } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { endSupportView } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import { useAppSelector } from '@/lib/store/hooks';
import {
  selectSupport,
  selectUser,
  selectWorkspaceName,
} from '@/lib/store/session-slice';

/**
 * Across the top of every page while Dossier's staff look at the workspace
 * in a support view: whose eyes these are, until when, and the way out.
 * The API refuses anything but reading, whatever a page offers.
 */
export function SupportBanner() {
  const support = useAppSelector(selectSupport);
  const owner = useAppSelector(selectUser);
  const workspace = useAppSelector(selectWorkspaceName);
  if (!support) return null;

  // In the viewer's own time: staff may be anywhere. The store only fills
  // in the browser, so this never renders on the server.
  const until = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(support.endsAt));

  return (
    <div
      role="status"
      className="sticky top-0 z-30 flex animate-enter flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-ink px-4 py-2.5 text-small text-paper sm:px-8 lg:px-10"
    >
      <p className="flex items-center gap-2">
        <Eye aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
        <span>
          <strong className="font-semibold">Support view, read-only.</strong>{' '}
          You’re seeing {workspace ?? 'this workspace'}
          {owner ? ` as ${owner.name} does` : ''}, until {until}.
        </span>
      </p>
      <form action={endSupportView}>
        <End />
      </form>
    </div>
  );
}

function End() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? 'Ending…' : 'End support view'}
    </Button>
  );
}
