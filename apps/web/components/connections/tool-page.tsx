import type { Tool } from '@dossierhq/contracts';
import type { Metadata } from 'next';
import Image from 'next/image';
import { ViewTransition } from 'react';
import { TopBar } from '@/components/shell/top-bar';
import { Cascade } from '@/components/ui/cascade';
import { TOOL_GUIDES } from '@/lib/catalog';
import glass from '@/public/illustrations/Illustration · 16-read-only-glass.png';
import { ToolPanel } from './tool-panel';

export const toolMetadata = (id: Tool): Metadata => ({
  title: `${TOOL_GUIDES[id].name} · Connections`,
});

/**
 * One tool's page: its connection, with where to find what it asks for.
 * Each tool has its own static route (no dynamic segment to wait for), so
 * everything here but the panel is prerendered, and the panel draws from
 * the store the Connections layout fills. Moving between tools dissolves the
 * old one and cascades the new one in, never a placeholder.
 */
export function ToolPage({ id }: { id: Tool }) {
  const guide = TOOL_GUIDES[id];
  return (
    <ViewTransition exit="page-out" default="none">
      <div>
        <Cascade>
          <TopBar
            title="Connections"
            subtitle="Read-only keys. Encrypted. Never shown again."
          />
          <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <ToolPanel id={id} guide={guide} />
            <aside
              aria-labelledby="where-to-find"
              className="relative flex flex-col overflow-hidden rounded-3xl bg-grey-1 p-5 sm:p-6 lg:min-h-full"
            >
              <p className="text-[0.75rem] text-muted">Where to find these</p>
              <h2 id="where-to-find" className="mt-1 text-h2">
                {guide.stepsIn}
              </h2>
              <ol className="mt-5 flex flex-col gap-3.5">
                {guide.steps.map((step, index) => (
                  <li key={step} className="flex gap-3 text-small">
                    <span
                      aria-hidden
                      className="grid size-6 shrink-0 place-items-center rounded-full bg-white font-mono text-label tracking-normal"
                    >
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              {guide.note && (
                <p className="mt-8 text-[0.75rem] text-muted">{guide.note}</p>
              )}
              <Image
                src={glass}
                alt=""
                sizes="14rem"
                loading="eager"
                className="mt-auto -mb-6 ml-auto h-auto w-56 translate-x-6 pt-6"
              />
            </aside>
          </div>
        </Cascade>
      </div>
    </ViewTransition>
  );
}
