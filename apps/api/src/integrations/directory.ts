import type { Client, Tool } from '@dossierhq/contracts';
import type { ClientLink } from '@dossierhq/database';
import type { ClientLookup, ExternalOrg } from './connector.js';
import { domainOf, normalizeName, shortHex, slugify } from './ids.js';

/** Domains anyone can have, which say nothing about the client. */
const SHARED_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'live.co.uk',
  'msn.com',
  'yahoo.com',
  'yahoo.co.uk',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
]);

/**
 * The workspace's clients while a sync runs. Joins up the same client across
 * tools: first by a link the tool already has, then by name. Tools that may
 * create clients (NinjaOne, Hudu) add the ones nobody has yet.
 */
export class ClientDirectory {
  private readonly clients: Map<string, Client>;
  private links: ClientLink[];

  constructor(
    private readonly workspaceId: string,
    clients: Client[],
    links: ClientLink[],
  ) {
    this.clients = new Map(clients.map((client) => [client.id, client]));
    this.links = links.filter((link) => this.clients.has(link.clientId));
  }

  /**
   * Matches one tool's organisations to clients. Returns the clients to save
   * (new or changed) and the tool's complete set of links.
   */
  adopt(
    tool: Tool,
    orgs: ExternalOrg[],
    createsClients: boolean,
  ): { clients: Client[]; links: ClientLink[] } {
    const existing = new Map(
      this.links
        .filter((link) => link.tool === tool)
        .map((link) => [link.externalId, link.clientId]),
    );
    const byName = new Map<string, string>();
    for (const client of [...this.clients.values()].sort((a, b) =>
      a.id < b.id ? -1 : 1,
    )) {
      const key = normalizeName(client.name);
      if (!byName.has(key)) byName.set(key, client.id);
    }

    const changed = new Map<string, Client>();
    const links: ClientLink[] = [];
    for (const org of orgs) {
      const key = normalizeName(org.name);
      let clientId = existing.get(org.externalId) ?? byName.get(key) ?? null;

      if (!clientId && createsClients && key) {
        const client: Client = {
          id: `${slugify(org.name)}-${shortHex(this.workspaceId, tool, org.externalId)}`,
          name: org.name.trim(),
          industry: null,
          location: org.location,
          seats: null,
          primaryContact: null,
          contract: null,
          domains: [...new Set(org.domains)],
        };
        this.clients.set(client.id, client);
        byName.set(key, client.id);
        changed.set(client.id, client);
        clientId = client.id;
      } else if (clientId) {
        const current = this.clients.get(clientId)!;
        const updated: Client = {
          ...current,
          location: org.location ?? current.location,
          domains: org.domains.length
            ? [...new Set([...org.domains, ...current.domains])]
            : current.domains,
        };
        if (JSON.stringify(updated) !== JSON.stringify(current)) {
          this.clients.set(clientId, updated);
          changed.set(clientId, updated);
        }
      }

      if (clientId && !links.some((l) => l.externalId === org.externalId)) {
        links.push({
          tool,
          externalId: org.externalId,
          clientId,
          name: org.name,
          url: org.url,
        });
      }
    }

    this.links = [...this.links.filter((link) => link.tool !== tool), ...links];
    return { clients: [...changed.values()], links };
  }

  /**
   * Lookups for one tool's records, once its organisations are adopted.
   * `attached` maps record IDs to the clients they were attached to by hand;
   * ones whose client has gone are ignored.
   */
  lookup(tool: Tool, attached: Record<string, string> = {}): ClientLookup {
    const byOrg = new Map(
      this.links
        .filter((link) => link.tool === tool)
        .map((link) => [link.externalId, link.clientId]),
    );
    return {
      forOrg: (externalId) => byOrg.get(externalId) ?? null,
      forDomains: (domains) => this.forDomains(domains),
      attached: (recordId) => {
        const clientId = Object.hasOwn(attached, recordId)
          ? attached[recordId]!
          : null;
        return clientId && this.clients.has(clientId) ? clientId : null;
      },
      name: (clientId) => this.clients.get(clientId)?.name ?? clientId,
    };
  }

  has(clientId: string): boolean {
    return this.clients.has(clientId);
  }

  /**
   * A client whose domains include one of these, or whose name is the
   * domain's first part (`harbourdental.co.uk` → Harbour Dental).
   */
  private forDomains(domains: string[]): string | null {
    const wanted = [
      ...new Set(domains.map((d) => domainOf(d)).filter((d) => d !== null)),
    ].filter((d) => !SHARED_DOMAINS.has(d));
    const clients = [...this.clients.values()];

    for (const domain of wanted) {
      const match = clients.find((client) =>
        client.domains.some(
          (own) => domain === own || domain.endsWith(`.${own}`),
        ),
      );
      if (match) return match.id;
    }
    for (const domain of wanted) {
      const label = domain.split('.')[0]!;
      if (label.length < 4) continue;
      const match = clients.find(
        (client) => normalizeName(client.name).replaceAll(' ', '') === label,
      );
      if (match) return match.id;
    }
    return null;
  }
}
