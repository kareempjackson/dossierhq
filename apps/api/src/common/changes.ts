import type {
  Device,
  Meeting,
  Ticket,
  TicketInsight,
} from '@dossierhq/contracts';
import type {
  ClientChange,
  DatabaseAdapter,
  PassMark,
} from '@dossierhq/database';

/** The client id that stands for records filed under no client. */
export const NO_CLIENT = '';

/**
 * The clients a step of the background pass still has to look at: those it
 * has never finished with, those whose records changed since it did, and,
 * with `staleBefore`, those it last finished with before then.
 */
export function dueClients(
  clientIds: string[],
  changes: ClientChange[],
  marks: PassMark[],
  staleBefore?: string,
): string[] {
  const changedAt = new Map(changes.map((c) => [c.clientId, c.changedAt]));
  const doneThrough = new Map(marks.map((m) => [m.clientId, m.doneThrough]));
  return clientIds.filter((id) => {
    const done = doneThrough.get(id);
    if (done === undefined) return true;
    if (staleBefore !== undefined && done < staleBefore) return true;
    const changed = changedAt.get(id);
    return changed !== undefined && changed > done;
  });
}

export type ClientRecords = {
  tickets: Ticket[];
  meetings: Meeting[];
  devices: Device[];
  insights: TicketInsight[];
};

/**
 * The tickets, meetings, devices and ticket reads of every client, or only
 * of `clientIds`: a pass that looks at two clients loads two clients'
 * records, not the workspace's.
 */
export async function clientRecords(
  db: DatabaseAdapter,
  workspaceId: string,
  clientIds?: string[],
): Promise<ClientRecords> {
  if (clientIds === undefined) {
    const [tickets, meetings, devices, insights] = await Promise.all([
      db.tickets.list(workspaceId),
      db.meetings.list(workspaceId),
      db.devices.list(workspaceId),
      db.ticketInsights.list(workspaceId),
    ]);
    return { tickets, meetings, devices, insights };
  }
  const out: ClientRecords = {
    tickets: [],
    meetings: [],
    devices: [],
    insights: [],
  };
  for (const clientId of clientIds) {
    const [tickets, meetings, devices, insights] = await Promise.all([
      db.tickets.list(workspaceId, { clientId }),
      db.meetings.list(workspaceId, { clientId }),
      db.devices.list(workspaceId, { clientId }),
      db.ticketInsights.list(workspaceId, { clientId }),
    ]);
    out.tickets.push(...tickets);
    out.meetings.push(...meetings);
    out.devices.push(...devices);
    out.insights.push(...insights);
  }
  return out;
}
