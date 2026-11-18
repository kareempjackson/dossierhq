'use client';

import type { Tool } from '@dossierhq/contracts';
import { useSyncExternalStore } from 'react';
import { IndexPattern } from '@/components/brand/index-pattern';
import { ButtonLink } from '@/components/ui/button';

/** What each tool brings to a client's file, said two ways. */
const PITCH: Record<Tool, { name: string; banner: string; nudge: string }> = {
  ninjaone: {
    name: 'NinjaOne',
    banner:
      'Connect NinjaOne and every device, alert and ticket lands in the file.',
    nudge: 'Devices, alerts and tickets will land here.',
  },
  hudu: {
    name: 'Hudu',
    banner: 'Connect Hudu and every renewal and expiry date lands in the file.',
    nudge: 'Renewals and expiry dates will land here.',
  },
  sharepoint: {
    name: 'SharePoint',
    banner: 'Connect SharePoint and every client’s folder lands in the file.',
    nudge: 'Client folders will land here.',
  },
  fathom: {
    name: 'Fathom',
    banner:
      'Connect Fathom and every promise you make on a call lands in the file.',
    nudge: 'Promises from calls will land here.',
  },
};

// One tool for the whole visit, so the sidebar and Home's banner agree. It's
// drawn at random in the browser, once the page is up, and kept until a full
// reload, or until that tool is connected.
let picked: Tool | null = null;

function pickFrom(missing: readonly Tool[]): Tool | null {
  if (missing.length === 0) return null;
  if (picked === null || !missing.includes(picked)) {
    picked = missing[Math.floor(Math.random() * missing.length)]!;
  }
  return picked;
}

const subscribe = () => () => {};

/**
 * One of the tools not connected yet, at random; null on the server and
 * until the page is up, so what's drawn never differs from what hydrates.
 */
function usePicked(missing: readonly Tool[]): Tool | null {
  return useSyncExternalStore(
    subscribe,
    () => pickFrom(missing),
    () => null,
  );
}

const connectHref = (tool: Tool) => `/connections/${tool}`;

/**
 * The sidebar's nudge, for one of the tools not connected yet. Left out on
 * short screens, where it would push the account off the bottom.
 */
export function ConnectNudge({ missing }: { missing: Tool[] }) {
  const tool = usePicked(missing);
  if (!tool) return null;
  const pitch = PITCH[tool];
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
      <p className="mt-3 text-small font-medium">
        {pitch.name} is not connected
      </p>
      <p className="mt-0.5 text-[0.75rem] leading-snug text-muted">
        {pitch.nudge}
      </p>
      <ButtonLink
        href={connectHref(tool)}
        variant="act"
        size="sm"
        className="mt-3"
      >
        Connect
      </ButtonLink>
    </div>
  );
}

/**
 * Home's banner, for the same tool the sidebar asks for. Its box is drawn
 * from the first paint, at its full height, so the page doesn't shift when
 * the words arrive with the pick.
 */
export function ConnectBanner({ missing }: { missing: Tool[] }) {
  const tool = usePicked(missing);
  if (missing.length === 0) return null;
  const pitch = tool ? PITCH[tool] : null;
  return (
    <aside
      aria-label={pitch ? `Connect ${pitch.name}` : 'Connect a tool'}
      className="relative isolate mt-10 flex min-h-[7.5rem] items-center overflow-hidden rounded-3xl bg-ink px-6 py-6 text-paper sm:px-8 lg:mt-5 lg:min-h-[6.5rem] lg:py-4"
    >
      {pitch && tool && (
        <div className="relative flex max-w-2xl animate-enter flex-wrap items-center gap-x-6 gap-y-4 xl:gap-x-10">
          <p className="max-w-md font-display text-h3">{pitch.banner}</p>
          <ButtonLink href={connectHref(tool)} variant="act">
            Connect {pitch.name}
          </ButtonLink>
        </div>
      )}
      <IndexPattern
        rows={3}
        cols={7}
        accents={[
          [1, 1],
          [2, 3],
        ]}
        accentClassName="text-lime"
        className="pointer-events-none absolute top-1/2 right-6 -z-10 hidden h-[78%] w-auto -translate-y-1/2 text-white/10 xl:block"
      />
    </aside>
  );
}
