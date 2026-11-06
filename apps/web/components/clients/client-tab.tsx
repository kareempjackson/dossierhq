import type { Client, WorkspaceRole } from '@dossierhq/contracts';
import type { Metadata } from 'next';
import { notFound, unstable_rethrow } from 'next/navigation';
import type { ReactNode } from 'react';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';
import { getMe } from '@/lib/data/auth';
import { getClient } from '@/lib/data/clients';
import { orNull } from '@/lib/data/safe';

type Params = Promise<{ id: string }>;

/** Who's looking, and when, for the tab to draw its dates. */
export type TabContext = {
  timeZone: string;
  now: Date;
  /** Owners and admins may change things; technicians only read. */
  role: WorkspaceRole;
};

/** "Files · Harbour Dental", for a client file tab's title. */
export async function clientTabMetadata(
  params: Params,
  tab: string,
): Promise<Metadata> {
  const client = await getClient((await params).id).catch(orNull);
  return { title: client ? `${tab} · ${client.name}` : tab };
}

/**
 * A client file tab's content, once the client is known from the URL. The
 * layout has the name, tabs and sheet; this streams in behind a skeleton.
 * A client the workspace doesn't have is not found.
 */
export function ClientTab({
  params,
  render,
}: {
  params: Params;
  render: (client: Client, context: TabContext) => Promise<ReactNode>;
}) {
  return (
    <Reveal fallback={<IndexLoader className="h-[19rem]" />}>
      <Resolve params={params} render={render} />
    </Reveal>
  );
}

async function Resolve({
  params,
  render,
}: {
  params: Params;
  render: (client: Client, context: TabContext) => Promise<ReactNode>;
}) {
  const [client, me] = await Promise.all([
    getClient((await params).id).catch((error: unknown) => {
      unstable_rethrow(error);
      return undefined;
    }),
    getMe(),
  ]);
  if (client === null) notFound();
  if (client === undefined) return <ReadFailed what="this client" />;
  return render(client, {
    timeZone: me.workspace.timeZone,
    now: new Date(),
    role: me.role,
  });
}

/** A read that failed: what couldn't be read, and that it's worth a retry. */
export function ReadFailed({ what }: { what: string }) {
  return (
    <p
      role="alert"
      className="rounded-xl bg-grey-1 px-4 py-8 text-center text-small text-muted"
    >
      Dossier couldn’t read {what} just now. Reload the page to try again.
    </p>
  );
}
