import type { AttentionItem, Ticket } from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../database/database.module.js';
import { clean, day, recordOf, type SharedRecords } from './pack.js';

/** The most clients the directory lists; past that, search finds the rest. */
const MAX_CLIENTS = 400;

const byName = (a: { name: string }, b: { name: string }) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

/** Every client in a line, for a model to choose whose records to read. */
export type Directory = {
  text: string;
  /** Every client, listed or not, by ID, to its name. */
  names: Map<string, string>;
};

/**
 * The workspace at a glance: each client's ID with a few headline facts, so
 * a model answering across clients knows whose records to read. No handles:
 * nothing here can be cited, only looked up.
 */
@Injectable()
export class WorkspaceIndex {
  constructor(@Inject(DATABASE) private readonly db: DatabaseAdapter) {}

  async directory(
    workspaceId: string,
    shared: SharedRecords,
  ): Promise<Directory> {
    const [overview, attention, tickets] = await Promise.all([
      this.db.clients.overview(workspaceId),
      this.db.attention.list(workspaceId),
      this.db.tickets.list(workspaceId),
    ]);
    const flagged = await this.shown(workspaceId, attention, tickets, shared);
    const listed = overview
      .map((item) => item.client)
      .sort(byName)
      .slice(0, MAX_CLIENTS);
    const lastMeeting = new Map(
      overview.map((item) => [item.client.id, item.lastMeetingAt]),
    );

    const lines = listed.map((client) => {
      const theirs = flagged.filter((a) => a.clientId === client.id);
      const critical = theirs.filter((a) => a.urgency === 'critical').length;
      const open = tickets.filter((t) => t.clientId === client.id && t.open);
      const met = lastMeeting.get(client.id);
      const facts = [
        client.industry && clean(client.industry, 60),
        client.seats != null && `${client.seats} seats`,
        theirs.length > 0
          ? `${theirs.length} flagged${critical > 0 ? `, ${critical} critical` : ''}`
          : 'nothing flagged',
        shared.tickets &&
          `${open.length} open ticket${open.length === 1 ? '' : 's'}`,
        shared.meetings && met && `last recorded meeting ${day(met)}`,
        client.contract && `contract renews ${client.contract.renewsOn}`,
      ].filter(Boolean);
      return `- ${client.id}: ${clean(client.name)} · ${facts.join(' · ')}`;
    });
    const more = overview.length - listed.length;
    const text = [
      '<client_directory>',
      `The MSP has ${overview.length} client${overview.length === 1 ? '' : 's'}. To read one, call client_records with its ID.`,
      ...lines,
      ...(more > 0
        ? [`- (+${more} more, not listed; search_records covers them all)`]
        : []),
      '</client_directory>',
    ].join('\n');
    return {
      text,
      names: new Map(
        overview.map((item) => [item.client.id, item.client.name]),
      ),
    };
  }

  /** What's flagged, without what rests on records kept from Claude. */
  private async shown(
    workspaceId: string,
    attention: AttentionItem[],
    tickets: Ticket[],
    shared: SharedRecords,
  ): Promise<AttentionItem[]> {
    if (Object.values(shared).every(Boolean)) return attention;
    const ticketSources = new Set(tickets.map((t) => t.sourceId));
    const sources = await this.db.sources.getMany(workspaceId, [
      ...new Set(attention.flatMap((a) => a.sourceIds)),
    ]);
    const withheld = new Set(
      sources
        .filter((s) => !shared[recordOf(s, ticketSources)])
        .map((s) => s.id),
    );
    return attention.filter((a) =>
      a.sourceIds.every((id) => !withheld.has(id)),
    );
  }
}
