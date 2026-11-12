'use client';

import type { AuditCount } from '@dossierhq/contracts';
import { useSearchParams } from 'next/navigation';
import { useLayoutEffect } from 'react';
import { ButtonAnchor } from '@/components/ui/button';
import {
  AUDIT_PATH,
  auditHref,
  auditTabs,
  auditViewOf,
  countOf,
  type AuditTool,
  type AuditView,
} from '@/lib/audit-paths';
import { cn } from '@/lib/cn';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { auditCountsLoaded, selectAuditCounts } from '@/lib/store/audit-slice';
import { AuditLink, useAuditNav } from './audit-nav';

/**
 * The audit log's tabs and its export, drawn in the browser from the URL,
 * so they stay on screen while each view loads and the tab you click lights
 * at once. aria-current stays with the view actually shown. The counts come
 * from the store (AuditCountsSync) and keep their place between tabs.
 */
export function AuditTabs({
  everything,
  tools,
}: {
  /** Owners and admins: sign-ins and changes as well as reads. */
  everything: boolean;
  tools: AuditTool[];
}) {
  const search = useSearchParams();
  const view = auditViewOf(
    (key) => search.get(key) || undefined,
    everything,
    tools.map((tool) => tool.id),
  );
  const filter: AuditView = {
    kind: view.kind,
    tool: view.tool,
    client: view.client,
  };
  const counts = useAppSelector((state) =>
    selectAuditCounts(state, filter.client ?? ''),
  );
  const { pending } = useAuditNav();
  const tabs = auditTabs(filter, everything, tools, counts);
  const lit = tabs.find((tab) => tab.href === pending)?.href;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Which entries" className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const on = lit ? tab.href === lit : tab.current;
            return (
              <AuditLink
                key={tab.label}
                href={tab.href}
                aria-current={tab.current ? 'page' : undefined}
                data-state={on ? 'on' : 'off'}
                className={cn(
                  'rounded-full px-3 py-1 text-small transition-colors duration-150',
                  on
                    ? 'bg-white text-ink ring-1 ring-grey-3'
                    : 'bg-grey-2 text-muted hover:text-ink',
                )}
              >
                {tab.label}
                {tab.count !== undefined &&
                  ` ${tab.count.toLocaleString('en-GB')}`}
              </AuditLink>
            );
          })}
        </nav>
        <ButtonAnchor
          href={auditHref(`${AUDIT_PATH}/export`, filter)}
          download
          variant="outline"
          size="sm"
        >
          Export CSV
        </ButtonAnchor>
      </div>

      {!everything && (
        <p className="mt-3 text-[0.75rem] text-muted">
          Sign-ins and the changes people make are shown to owners and admins.
        </p>
      )}
    </>
  );
}

/**
 * Hands the counts the server read for one client ('' for every client) to
 * the store. Renders nothing.
 */
export function AuditCountsSync({
  client,
  counts,
}: {
  client: string;
  counts: AuditCount[];
}) {
  const dispatch = useAppDispatch();
  // Compared by content: each server render sends a fresh array.
  const key = JSON.stringify(counts);
  useLayoutEffect(() => {
    dispatch(
      auditCountsLoaded({ client, counts: JSON.parse(key) as AuditCount[] }),
    );
  }, [dispatch, client, key]);
  return null;
}

/** How many entries the view holds, beside Newer and Older. */
export function AuditTotal({
  view,
  everything,
  onPage,
  paged,
}: {
  view: AuditView;
  everything: boolean;
  /** Entries on this page. */
  onPage: number;
  /** Whether there's more than one page. */
  paged: boolean;
}) {
  const counts = useAppSelector((state) =>
    selectAuditCounts(state, view.client ?? ''),
  );
  const total = countOf(view, everything, counts);
  if (!total) return null;
  return (
    <p className="text-[0.75rem] text-muted">
      {total.toLocaleString('en-GB')} {total === 1 ? 'entry' : 'entries'}
      {paged && ` · ${onPage} on this page`}
    </p>
  );
}
