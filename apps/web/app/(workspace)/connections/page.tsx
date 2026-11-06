import type { Metadata } from 'next';
import { ViewTransition } from 'react';
import { FieldPattern } from '@/components/brand/field-pattern';
import { ToolCards } from '@/components/connections/tool-cards';
import { ToolIcon } from '@/components/connections/tool-icon';
import { TopBar } from '@/components/shell/top-bar';
import { ButtonLink } from '@/components/ui/button';
import { Cascade } from '@/components/ui/cascade';
import { Tag } from '@/components/ui/tag';
import { PLANNED_TOOLS } from '@/lib/catalog';

export const metadata: Metadata = { title: 'Connections' };

/**
 * Each tool Dossier reads and its state (from the store the Connections
 * layout fills); the tools coming later; and a reminder that it only reads.
 * Static around the cards, so it draws at once.
 */
export default function ConnectionsPage() {
  return (
    <ViewTransition exit="page-out" default="none">
      <div>
        <Cascade>
          <TopBar
            title="Connections"
            subtitle="Read-only keys. Encrypted. Never shown again."
          />
          <ToolCards />

          <section aria-labelledby="coming-soon" className="mt-10">
            <h2 id="coming-soon" className="text-h3">
              Coming soon
            </h2>
            <p className="mt-1 text-small text-muted">
              Tools Dossier will read next. They can’t be connected yet.
            </p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PLANNED_TOOLS.map((tool) => (
                <li
                  key={tool.name}
                  className="flex items-start justify-between gap-3 rounded-2xl bg-grey-1 p-4"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      <ToolIcon />
                      {tool.name}
                    </p>
                    {tool.brings && (
                      <p className="mt-1 text-small text-muted">
                        {tool.brings}
                      </p>
                    )}
                  </div>
                  <Tag tone="neutral">Coming soon</Tag>
                </li>
              ))}
            </ul>
          </section>

          <section
            aria-labelledby="reads-only"
            className="relative isolate mt-8 overflow-hidden rounded-3xl bg-deep px-6 py-8 text-paper sm:px-8"
          >
            <div className="relative max-w-md">
              <h2 id="reads-only" className="text-h1">
                Dossier reads.
                <br />
                It never writes.
              </h2>
              <p className="mt-4 text-small text-paper/70">
                Every read is written to the audit log. Keys are encrypted and
                never displayed after you save them.
              </p>
              <ButtonLink href="/audit-log" variant="act" className="mt-6">
                View audit log
              </ButtonLink>
            </div>
            <FieldPattern
              rows={10}
              cols={22}
              seed={3}
              className="pointer-events-none absolute top-1/2 right-6 -z-10 hidden h-auto w-[44%] -translate-y-1/2 text-lilac-deep md:block"
            />
          </section>
        </Cascade>
      </div>
    </ViewTransition>
  );
}
