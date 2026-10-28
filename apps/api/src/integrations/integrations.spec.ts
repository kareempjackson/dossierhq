import type { Client } from '@dossierhq/contracts';
import { z } from 'zod';
import { ClientDirectory } from './directory.js';
import { ToolHttp } from './http.js';
import { domainOf, normalizeName, slugify } from './ids.js';
import { Secrets } from './secrets.js';
import { consistent } from './sync.service.js';

const client = (id: string, name: string, domains: string[] = []): Client => ({
  id,
  name,
  industry: null,
  location: null,
  seats: null,
  primaryContact: null,
  contract: null,
  domains,
});

describe('names and domains', () => {
  it('compares names the way people write them', () => {
    expect(normalizeName('The Harbour Dental Co. Ltd')).toBe('harbour dental');
    expect(normalizeName('Smith & Jones LLP')).toBe('smith and jones');
    expect(normalizeName('Café Nero')).toBe('cafe nero');
    expect(slugify('Smith & Jones, LLP')).toBe('smith-and-jones-llp');
  });

  it('pulls the domain out of websites and emails', () => {
    expect(domainOf('https://www.harbourdental.co.uk/contact')).toBe(
      'harbourdental.co.uk',
    );
    expect(domainOf('priya@HarbourDental.co.uk')).toBe('harbourdental.co.uk');
    expect(domainOf('cedarstreet.example')).toBe('cedarstreet.example');
    expect(domainOf('localhost')).toBeNull();
    expect(domainOf(null)).toBeNull();
  });
});

describe('ClientDirectory', () => {
  const orgs = [
    {
      externalId: '1',
      name: 'Harbour Dental Ltd',
      url: 'https://x/1',
      domains: [],
      location: null,
    },
    {
      externalId: '2',
      name: 'Marlow Freight',
      url: 'https://x/2',
      domains: [],
      location: null,
    },
  ];

  it('creates clients once, and joins other tools to them by name', () => {
    const directory = new ClientDirectory('ws', [], []);
    const first = directory.adopt('ninjaone', orgs, true);
    expect(first.clients.map((c) => c.id)).toEqual([
      expect.stringMatching(/^harbour-dental-ltd-[0-9a-f]{6}$/),
      expect.stringMatching(/^marlow-freight-[0-9a-f]{6}$/),
    ]);

    const hudu = directory.adopt(
      'hudu',
      [
        {
          externalId: 'h1',
          name: 'Harbour Dental',
          url: 'https://h/1',
          domains: ['harbourdental.co.uk'],
          location: 'Portsmouth',
        },
      ],
      true,
    );
    expect(hudu.clients).toEqual([
      expect.objectContaining({
        id: first.clients[0]!.id,
        location: 'Portsmouth',
        domains: ['harbourdental.co.uk'],
      }),
    ]);
    expect(hudu.links[0]?.clientId).toBe(first.clients[0]!.id);
  });

  it('keeps an existing link even after the client is renamed', () => {
    const renamed = client('hd', 'HD Group');
    const directory = new ClientDirectory(
      'ws',
      [renamed],
      [
        {
          tool: 'ninjaone',
          externalId: '1',
          clientId: 'hd',
          name: 'old',
          url: 'x',
        },
      ],
    );
    const { clients, links } = directory.adopt(
      'ninjaone',
      orgs.slice(0, 1),
      true,
    );
    expect(clients).toEqual([]);
    expect(links[0]?.clientId).toBe('hd');
  });

  it('never creates clients for tools that only attach', () => {
    const directory = new ClientDirectory('ws', [], []);
    expect(directory.adopt('sharepoint', orgs, false)).toEqual({
      clients: [],
      links: [],
    });
  });

  it('matches domains exactly, then by name, and ignores webmail', () => {
    const directory = new ClientDirectory(
      'ws',
      [
        client('hd', 'Harbour Dental', ['harbourdental.co.uk']),
        client('mf', 'Marlow Freight'),
      ],
      [],
    );
    const lookup = directory.lookup('fathom');
    expect(lookup.forDomains(['mail.harbourdental.co.uk'])).toBe('hd');
    expect(lookup.forDomains(['marlowfreight.com'])).toBe('mf');
    expect(lookup.forDomains(['gmail.com', 'example.org'])).toBeNull();
  });
});

describe('Secrets', () => {
  it('round-trips, and refuses another key or tampering', () => {
    const secrets = new Secrets(Buffer.alloc(32, 7));
    const sealed = secrets.encrypt({ apiKey: 'abc' });
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain('abc');
    expect(secrets.decrypt(sealed)).toEqual({ apiKey: 'abc' });
    expect(() => new Secrets(Buffer.alloc(32, 8)).decrypt(sealed)).toThrow();
    expect(() => secrets.decrypt(`${sealed.slice(0, -2)}xx`)).toThrow();
    expect(new Secrets(undefined).available).toBe(false);
  });
});

describe('ToolHttp', () => {
  it('names the keys of an object reply it didn’t expect', async () => {
    const http = new ToolHttp('Hudu', {
      fetch: async () => Response.json({ websites: [] }),
    });
    const read = http.json(
      'https://hudu.test/api/v1/websites',
      z.array(z.unknown()),
      {
        what: 'websites',
      },
    );
    await expect(read).rejects.toMatchObject({
      kind: 'unexpected',
      message: 'Hudu sent websites in a form Dossier didn’t expect.',
      detail: expect.stringContaining('(top-level keys: websites)'),
    });
  });
});

describe('consistent', () => {
  it('drops duplicates, unknown clients and dangling citations', () => {
    const source = (id: string, clientId: string | null) => ({
      id,
      kind: 'record' as const,
      clientId,
      tool: 'ninjaone' as const,
      recordId: id,
      recordType: 'Device',
      title: id,
      recordedAt: '2030-01-01T00:00:00.000Z',
      url: 'https://x',
      fields: [],
    });
    const item = (id: string, sourceIds: string[]) => ({
      id,
      clientId: 'known',
      kind: 'alert' as const,
      urgency: 'high' as const,
      title: id,
      raisedAt: '2030-01-01T00:00:00.000Z',
      sourceIds,
    });
    const result = consistent(
      {
        sources: [
          source('s1', 'known'),
          source('s1', 'known'),
          source('s2', 'gone'),
        ],
        devices: [],
        tickets: [],
        meetings: [],
        commitments: [],
        attention: [item('a1', ['s1', 's2']), item('a2', ['s2'])],
      },
      (id) => id === 'known',
    );
    expect(result.sources.map((s) => s.id)).toEqual(['s1']);
    expect(result.attention).toEqual([item('a1', ['s1'])]);
  });
});
