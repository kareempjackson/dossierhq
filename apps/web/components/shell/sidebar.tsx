import { toolSchema } from '@dossierhq/contracts';
import Link from 'next/link';
import { Suspense } from 'react';
import { Logo } from '@/components/brand/logo';
import { getConnectors } from '@/lib/data/connectors';
import { orNull } from '@/lib/data/safe';
import { ConnectNudge } from './connect-nudge';
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
          <ConnectNudgeUnlessConnected />
        </Suspense>
        <SidebarUser />
      </div>
    </aside>
  );
}

/** The nudge, once the API says which tools aren't connected. */
async function ConnectNudgeUnlessConnected() {
  const connectors = await getConnectors().catch(orNull);
  if (!connectors) return null;
  const missing = toolSchema.options.filter(
    (tool) => !connectors.some((each) => each.tool === tool),
  );
  return missing.length > 0 ? <ConnectNudge missing={missing} /> : null;
}
