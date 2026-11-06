import Link from 'next/link';
import { IndexPattern } from '@/components/brand/index-pattern';
import { Logo } from '@/components/brand/logo';
import { ButtonLink } from '@/components/ui/button';
import { Suspense } from 'react';
import { getConnectors } from '@/lib/data/connectors';
import { orNull } from '@/lib/data/safe';
import { NavLinks } from './nav-links';
import { SidebarUser } from './sidebar-user';

/** The workspace's left side: where things are, and who's signed in. */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col overflow-y-auto bg-grey-1 px-3 py-5 lg:flex">
      <Link
        href="/"
        aria-label="Dossier, today"
        className="mb-7 self-start rounded-sm px-2.5"
      >
        <Logo height={22} />
      </Link>
      <NavLinks />
      <div className="mt-auto flex flex-col gap-5 pt-8">
        <Suspense fallback={null}>
          <FathomNudgeUnlessConnected />
        </Suspense>
        <SidebarUser />
      </div>
    </aside>
  );
}

/** The nudge, once the API says Fathom isn't connected. */
async function FathomNudgeUnlessConnected() {
  const connectors = await getConnectors().catch(orNull);
  if (!connectors || connectors.some((each) => each.tool === 'fathom')) {
    return null;
  }
  return <FathomNudge />;
}

/**
 * Shown until Fathom is connected: it's where promises come from. Left out
 * on short screens, where it would push the account off the bottom.
 */
function FathomNudge() {
  return (
    <div className="animate-enter rounded-2xl bg-lime-soft p-3 [@media(max-height:52rem)]:hidden">
      <IndexPattern
        rows={3}
        cols={7}
        accents={[
          [1, 1],
          [2, 3],
        ]}
        accentClassName="text-lime"
        className="w-full text-stone"
      />
      <p className="mt-3 text-small font-medium">Fathom is not connected</p>
      <p className="mt-0.5 text-[0.75rem] leading-snug text-muted">
        Promises from calls will land here.
      </p>
      <ButtonLink
        href="/connections/fathom"
        variant="act"
        size="sm"
        className="mt-3"
      >
        Connect
      </ButtonLink>
    </div>
  );
}
