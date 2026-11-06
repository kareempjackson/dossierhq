import 'server-only';
import {
  auditCountSchema,
  auditPageSchema,
  listOf,
  type AuditCount,
  type AuditKind,
  type AuditPage,
  type Tool,
} from '@dossierhq/contracts';
import { cache } from 'react';
import { apiGet, withQuery } from '../api';

/** Entries on one page of the audit log. */
export const AUDIT_PAGE_SIZE = 50;

export type AuditQuery = {
  kind?: AuditKind;
  tool?: Tool;
  clientId?: string;
  /** A page's `older`, for the entries before it. */
  before?: string;
  /** A page's `newer`, for the entries after it. */
  after?: string;
  limit?: number;
};

/**
 * One page of the audit log, newest first. Turn it with the page's `older`
 * (as `before`) or `newer` (as `after`); each is null at that end. The API
 * gives technicians reads only, and answers 403 if they ask for sign-ins or
 * changes, and 400 for a cursor that isn't one.
 */
export function getAuditPage({
  kind,
  tool,
  clientId,
  before,
  after,
  limit = AUDIT_PAGE_SIZE,
}: AuditQuery): Promise<AuditPage> {
  return apiGet(
    withQuery('/audit', { kind, tool, clientId, before, after, limit }),
    auditPageSchema,
  );
}

/**
 * How many entries the log holds, by group: reads per tool, then sign-ins
 * and changes. Technicians get reads only.
 */
export const getAuditCounts = cache(
  async (clientId?: string): Promise<AuditCount[]> =>
    (
      await apiGet(
        withQuery('/audit/counts', { clientId }),
        listOf(auditCountSchema),
      )
    ).data,
);
