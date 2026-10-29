import {
  toolSchema,
  type AttentionItem,
  type AuditCount,
  type AuditEntry,
  type ClientListItem,
  type Commitment,
  type Connector,
  type Device,
  type Meeting,
  type Recommendation,
  type Report,
  type ReportSummary,
  type Source,
  type Ticket,
  type Urgency,
} from '@dossierhq/contracts';
import type { IntelligenceRun } from './types.js';

/**
 * The orderings the repository contract promises. Every adapter sorts with
 * these, so all of them return rows in exactly the same order. Text compares
 * by code point (like Postgres's "C" collation), never by locale.
 */

export const compareText = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

const urgencyRank: Record<Urgency, number> = {
  critical: 0,
  high: 1,
  normal: 2,
};
const patchRank: Record<Device['patchStatus'], number> = {
  failed: 0,
  pending: 1,
  current: 2,
};
const toolRank = new Map(
  toolSchema.options.map((tool, index) => [tool, index]),
);

export const byName = (a: { name: string }, b: { name: string }) =>
  compareText(a.name, b.name);

/** People by name, then ID for people with the same name. */
export const byMember = (
  a: { name: string; id: string },
  b: { name: string; id: string },
) => compareText(a.name, b.name) || compareText(a.id, b.id);

/** Sessions newest first. */
export const bySessionRecency = (
  a: { createdAt: string; tokenHash: string },
  b: { createdAt: string; tokenHash: string },
) =>
  compareText(b.createdAt, a.createdAt) ||
  compareText(a.tokenHash, b.tokenHash);

/** Notes by the day of the meeting, newest first, then newest added. */
export const byNote = (
  a: { occurredOn: string; createdAt: string; id: string },
  b: { occurredOn: string; createdAt: string; id: string },
) =>
  compareText(b.occurredOn, a.occurredOn) ||
  compareText(b.createdAt, a.createdAt) ||
  compareText(a.id, b.id);

/** Deliveries newest first. */
export const byDelivery = (
  a: { at: string; id: string },
  b: { at: string; id: string },
) => compareText(b.at, a.at) || compareText(a.id, b.id);

/** Invites newest first. */
export const byInvite = (
  a: { createdAt: string; id: string },
  b: { createdAt: string; id: string },
) => compareText(b.createdAt, a.createdAt) || compareText(a.id, b.id);

export const byAttention = (a: AttentionItem, b: AttentionItem) =>
  urgencyRank[a.urgency] - urgencyRank[b.urgency] ||
  compareText(b.raisedAt, a.raisedAt) ||
  compareText(a.id, b.id);

export const byOverview = (a: ClientListItem, b: ClientListItem) =>
  b.attention.critical - a.attention.critical ||
  b.attention.high - a.attention.high ||
  b.attention.total - a.attention.total ||
  byName(a.client, b.client);

export const byRecommendation = (a: Recommendation, b: Recommendation) =>
  compareText(b.createdAt, a.createdAt) || compareText(a.id, b.id);

export const byCommitment = (a: Commitment, b: Commitment) => {
  if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
  if (a.status === 'open') {
    return (
      compareText(a.dueOn ?? '9999-12-31', b.dueOn ?? '9999-12-31') ||
      compareText(a.id, b.id)
    );
  }
  return (
    compareText(b.completedAt ?? '', a.completedAt ?? '') ||
    compareText(a.id, b.id)
  );
};

export const byMeeting = (a: Meeting, b: Meeting) =>
  compareText(b.occurredAt, a.occurredAt) || compareText(a.id, b.id);

export const byDevice = (a: Device, b: Device) =>
  patchRank[a.patchStatus] - patchRank[b.patchStatus] ||
  compareText(a.name, b.name) ||
  compareText(a.id, b.id);

export const byTicket = (a: Ticket, b: Ticket) => {
  if (a.open !== b.open) return a.open ? -1 : 1;
  return (
    (a.open ? urgencyRank[a.urgency] - urgencyRank[b.urgency] : 0) ||
    compareText(b.updatedAt, a.updatedAt) ||
    compareText(a.id, b.id)
  );
};

/** Needs client names, which summaries don't carry. */
export const byReportWeek =
  (clientName: (clientId: string) => string) =>
  (a: ReportSummary, b: ReportSummary) =>
    compareText(b.weekStart, a.weekStart) ||
    compareText(clientName(a.clientId), clientName(b.clientId)) ||
    compareText(a.id, b.id);

export const bySourceRecency = (a: Source, b: Source) =>
  compareText(b.recordedAt, a.recordedAt) || compareText(a.id, b.id);

export const byTool = (a: Connector, b: Connector) =>
  (toolRank.get(a.tool) ?? 99) - (toolRank.get(b.tool) ?? 99);

/** Newest first. */
export const byRunRecency = (a: IntelligenceRun, b: IntelligenceRun) =>
  compareText(b.startedAt, a.startedAt) || compareText(a.id, b.id);

/** Whether an entry counts in an audit count's group (see AUDIT_COUNT_GROUPS). */
export const inAuditGroup =
  (group: Pick<AuditCount, 'kind' | 'tool'>) =>
  (entry: Pick<AuditEntry, 'kind' | 'tool'>) =>
    entry.kind === group.kind &&
    (group.tool === null || entry.tool === group.tool);

export const byAuditRecency = (
  a: Pick<AuditEntry, 'at' | 'id'>,
  b: Pick<AuditEntry, 'at' | 'id'>,
) => compareText(b.at, a.at) || compareText(a.id, b.id);

/** A report without its body. */
export function toSummary(report: Report): ReportSummary {
  const { id, clientId, weekStart, weekEnd, status, generatedAt } = report;
  const { exceptions, approvedAt, editedAt, sentAt } = report;
  return {
    id,
    clientId,
    weekStart,
    weekEnd,
    status,
    generatedAt,
    exceptions,
    approvedAt,
    editedAt,
    sentAt,
  };
}

/** Keeps `items` in the order of `ids`, dropping IDs with no item. */
export function inIdOrder<T extends { id: string }>(
  ids: string[],
  items: T[],
): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/** Report questions: oldest first, so the order they were asked in. */
export const byQuestion = (
  a: { createdAt: string; id: string },
  b: { createdAt: string; id: string },
) => compareText(a.createdAt, b.createdAt) || compareText(a.id, b.id);
