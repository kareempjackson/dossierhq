import { Eye } from 'lucide-react';
import { endSupportView } from '@/app/auth-actions';
import { getMe } from '@/lib/data';
import { orNull } from '@/lib/data/safe';
import { formatTime } from '@/lib/format';

/**
 * Across the top in a support view: whose workspace this is, that it's
 * read-only, when the view ends, and the way out.
 */
export async function SupportBanner() {
  const me = await getMe().catch(orNull);
  if (!me?.support) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-night px-4 py-2 text-meta text-white"
    >
      <p className="flex items-center gap-2">
        <Eye
          aria-hidden
          className="size-4 shrink-0 text-mint"
          strokeWidth={1.75}
        />
        <span>
          <span className="font-medium">Dossier support view</span> of{' '}
          {me.workspace.name}, as {me.user.name}. Read-only; ends at{' '}
          <time dateTime={me.support.endsAt}>
            {formatTime(me.support.endsAt, me.workspace.timeZone)}
          </time>
          .
        </span>
      </p>
      <form action={endSupportView}>
        <button
          type="submit"
          className="rounded-full px-3 py-1 font-medium text-mint ring-1 ring-mint/40 ring-inset transition-colors hover:bg-white/10"
        >
          End support view
        </button>
      </form>
    </div>
  );
}
