import type { ToolRecords } from '@dossierhq/database';
import { demo } from '@dossierhq/fixtures';
import {
  changedClients,
  clientFingerprints,
} from '../integrations/sync.service.js';
import { dueClients, NO_CLIENT } from './changes.js';

const at = (hour: number) =>
  `2030-06-01T${String(hour).padStart(2, '0')}:00:00.000Z`;

describe('dueClients', () => {
  const clients = ['a', 'b', 'c', 'd'];

  it('is every client before a step has finished with any', () => {
    expect(dueClients(clients, [], [])).toEqual(clients);
  });

  it('is only the clients that changed since the step finished with them', () => {
    const marks = clients.map((clientId) => ({ clientId, doneThrough: at(5) }));
    const changes = [
      { clientId: 'a', changedAt: at(4) },
      { clientId: 'b', changedAt: at(6) },
      // Exactly when the step started: it saw this change.
      { clientId: 'c', changedAt: at(5) },
    ];
    expect(dueClients(clients, changes, marks)).toEqual(['b']);
  });

  it('adds a client the step has never seen, and ones it saw too long ago', () => {
    const marks = [
      { clientId: 'a', doneThrough: at(1) },
      { clientId: 'b', doneThrough: at(9) },
      { clientId: 'c', doneThrough: at(9) },
    ];
    expect(dueClients(clients, [], marks)).toEqual(['d']);
    expect(dueClients(clients, [], marks, at(2))).toEqual(['a', 'd']);
  });
});

describe('clientFingerprints', () => {
  const records: ToolRecords = {
    sources: demo.sources,
    devices: demo.devices,
    tickets: demo.tickets,
    meetings: demo.meetings,
    commitments: demo.commitments,
    attention: demo.attentionItems,
  };
  const before = clientFingerprints(records);

  it('gives every client with records a fingerprint, and says all changed the first time', () => {
    const withRecords = new Set(
      demo.tickets.map((ticket) => ticket.clientId ?? NO_CLIENT),
    );
    for (const id of withRecords) expect(before[id]).toBeDefined();
    expect(changedClients(undefined, before).sort()).toEqual(
      Object.keys(before).sort(),
    );
    expect(changedClients(before, clientFingerprints(records))).toEqual([]);
  });

  it('doesn’t count a device checking in', () => {
    const later = '2031-01-01T00:00:00.000Z';
    const deviceSources = new Set(demo.devices.map((d) => d.sourceId));
    const checkedIn: ToolRecords = {
      ...records,
      devices: demo.devices.map((d) => ({ ...d, lastSeenAt: later })),
      sources: demo.sources.map((s) =>
        deviceSources.has(s.id) ? { ...s, recordedAt: later } : s,
      ),
    };
    expect(changedClients(before, clientFingerprints(checkedIn))).toEqual([]);
  });

  it('names the one client whose ticket changed', () => {
    const ticket = demo.tickets[0]!;
    const changed: ToolRecords = {
      ...records,
      tickets: demo.tickets.map((t) =>
        t.id === ticket.id ? { ...t, subject: `${t.subject} (again)` } : t,
      ),
    };
    expect(changedClients(before, clientFingerprints(changed))).toEqual([
      ticket.clientId ?? NO_CLIENT,
    ]);
  });

  it('names a client whose records are all gone', () => {
    const gone = demo.tickets[0]!.clientId!;
    const without: ToolRecords = {
      sources: demo.sources.filter((r) => r.clientId !== gone),
      devices: demo.devices.filter((r) => r.clientId !== gone),
      tickets: demo.tickets.filter((r) => r.clientId !== gone),
      meetings: demo.meetings.filter((r) => r.clientId !== gone),
      commitments: demo.commitments.filter((r) => r.clientId !== gone),
      attention: demo.attentionItems.filter((r) => r.clientId !== gone),
    };
    expect(changedClients(before, clientFingerprints(without))).toEqual([gone]);
  });
});
