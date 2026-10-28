import {
  attentionItemSchema,
  auditEntrySchema,
  clientSchema,
  commitmentSchema,
  connectorSchema,
  deviceSchema,
  meetingSchema,
  recommendationSchema,
  reportSchema,
  sourceSchema,
  ticketSchema,
  toolSchema,
  userSchema,
  workspaceSchema,
  type AttentionItem,
  type AuditEntry,
  type Client,
  type ClientListItem,
  type Commitment,
  type Device,
  type Meeting,
  type Recommendation,
  type Report,
  type Source,
  type Ticket,
  type Tool,
} from '@dossierhq/contracts';
import { demo } from '@dossierhq/fixtures';
import { z } from 'zod';
import {
  byAttention,
  byAuditRecency,
  byCommitment,
  byDevice,
  byMeeting,
  byName,
  byOverview,
  byRecommendation,
  byReportWeek,
  bySourceRecency,
  byTicket,
  byTool,
  compareText,
  toSummary,
} from '../ordering.js';
import {
  AUDIT_PAGE_SIZE,
  type ClientLink,
  type ConnectorRecord,
  type DatabaseAdapter,
  type IntelligenceRun,
} from '../types.js';
import { SCRATCH_PREFIX } from './load-demo.js';

const ws = demo.workspace.id;
const clientName = (id: string) =>
  demo.clients.find((c) => c.id === id)?.name ?? id;
const forClient = (clientId: string) => (item: { clientId: string | null }) =>
  item.clientId === clientId;

/** What every adapter must return for the demo workspace. */
const expected = {
  clients: [...demo.clients].sort(byName),
  overview: demo.clients
    .map((client): ClientListItem => {
      const items = demo.attentionItems.filter(forClient(client.id));
      const latest = demo.reports
        .filter(forClient(client.id))
        .sort((a, b) => compareText(b.weekStart, a.weekStart))[0];
      const meetings = demo.meetings.filter(forClient(client.id));
      return {
        client,
        attention: {
          total: items.length,
          critical: items.filter((i) => i.urgency === 'critical').length,
          high: items.filter((i) => i.urgency === 'high').length,
        },
        lastMeetingAt:
          meetings
            .map((m) => m.occurredAt)
            .sort(compareText)
            .at(-1) ?? null,
        latestReport: latest ? toSummary(latest) : null,
      };
    })
    .sort(byOverview),
  recent: [...demo.clientViews]
    .sort((a, b) => compareText(b.viewedAt, a.viewedAt))
    .map((view) => demo.clients.find((c) => c.id === view.clientId)!),
};

/**
 * The behaviour every adapter must share, checked against the demo workspace.
 * Each adapter's test file runs this; a new adapter is ready once it passes.
 *
 * SQL adapters load the demo workspace through `prepare` (see load-demo.ts),
 * which returns the clean-up. Tests that change demo data put it back; tests
 * of sync writes use a scratch workspace of their own.
 */
export function describeDatabaseContract(
  name: string,
  setup: () => Promise<DatabaseAdapter>,
  {
    skip = false,
    prepare,
  }: { skip?: boolean; prepare?: () => Promise<() => Promise<void>> } = {},
) {
  describe.skipIf(skip)(`${name} adapter: database contract`, () => {
    let db: DatabaseAdapter;
    let cleanUp: (() => Promise<void>) | undefined;

    beforeAll(async () => {
      cleanUp = await prepare?.();
      db = await setup();
      await db.ping();
    });

    afterAll(async () => {
      await db?.close();
      await cleanUp?.();
    });

    describe('sign-up', () => {
      const workspace = {
        id: `${SCRATCH_PREFIX}sign-up`,
        name: 'Sign-up',
        timeZone: 'UTC',
      };
      const owner = {
        id: `${SCRATCH_PREFIX}usr-sign-up`,
        email: 'sign-up@example.com',
        name: 'Sign Up',
        title: '',
        passwordHash: 'not-a-real-hash',
      };

      it('creates a workspace with its owner', async () => {
        await expect(db.users.createOwner(workspace, owner)).resolves.toBe(
          true,
        );
        await expect(db.workspaces.get(workspace.id)).resolves.toEqual(
          workspace,
        );
        await expect(db.users.findByEmail(owner.email)).resolves.toEqual(owner);
        await expect(db.users.memberships(owner.id)).resolves.toEqual([
          { workspaceId: workspace.id, userId: owner.id, role: 'owner' },
        ]);
        await expect(db.clients.list(workspace.id)).resolves.toEqual([]);
      });

      it('changes nothing when the email already has an account', async () => {
        const taken = { ...workspace, id: `${SCRATCH_PREFIX}sign-up-taken` };
        await expect(
          db.users.createOwner(taken, {
            ...owner,
            id: `${SCRATCH_PREFIX}usr-sign-up-taken`,
            email: demo.users[0]!.email,
          }),
        ).resolves.toBe(false);
        await expect(db.workspaces.get(taken.id)).resolves.toBeNull();
        await expect(
          db.users.get(`${SCRATCH_PREFIX}usr-sign-up-taken`),
        ).resolves.toBeNull();
      });
    });

    describeSyncWrites(() => db);

    describe('users and sessions', () => {
      const sam = demo.users[0]!;

      it('finds a user by email, ignoring case', async () => {
        await expect(
          db.users.findByEmail(sam.email.toUpperCase()),
        ).resolves.toEqual(sam);
        await expect(
          db.users.findByEmail('nobody@example.com'),
        ).resolves.toBeNull();
      });

      it('reads a user without their password hash', async () => {
        const user = await db.users.get(sam.id);
        expect(userSchema.strict().parse(user)).toEqual({
          id: sam.id,
          email: sam.email,
          name: sam.name,
          title: sam.title,
        });
        await expect(db.users.get('no-such-user')).resolves.toBeNull();
      });

      it('lists memberships', async () => {
        await expect(db.users.memberships(sam.id)).resolves.toEqual(
          demo.memberships.filter((m) => m.userId === sam.id),
        );
      });

      it('creates, finds and deletes a session', async () => {
        const session = {
          tokenHash: `contract-test-${Math.random().toString(36).slice(2)}`,
          userId: sam.id,
          workspaceId: ws,
          createdAt: '2030-01-01T00:00:00.000Z',
          expiresAt: '2030-01-31T00:00:00.000Z',
        };
        try {
          await db.sessions.create(session);
          await expect(db.sessions.find(session.tokenHash)).resolves.toEqual(
            session,
          );
        } finally {
          await db.sessions.delete(session.tokenHash);
        }
        await expect(db.sessions.find(session.tokenHash)).resolves.toBeNull();
      });
    });

    describe('password resets', () => {
      const user = {
        id: `${SCRATCH_PREFIX}usr-reset`,
        email: 'reset@example.com',
        name: 'Reset',
        title: '',
        passwordHash: 'old-hash',
      };
      const unique = () =>
        `contract-test-${Math.random().toString(36).slice(2)}`;
      const reset = (tokenHash: string) => ({
        tokenHash,
        userId: user.id,
        createdAt: '2030-01-01T00:00:00.000Z',
        expiresAt: '2030-01-01T01:00:00.000Z',
      });
      const before = '2030-01-01T00:30:00.000Z';

      beforeAll(async () => {
        await db.users.createOwner(
          { id: `${SCRATCH_PREFIX}reset`, name: 'Reset', timeZone: 'UTC' },
          user,
        );
      });

      it('changes a password and signs the user out everywhere', async () => {
        const session = (tokenHash: string) => ({
          tokenHash,
          userId: user.id,
          workspaceId: `${SCRATCH_PREFIX}reset`,
          createdAt: '2030-01-01T00:00:00.000Z',
          expiresAt: '2030-01-31T00:00:00.000Z',
        });
        const [a, b] = [unique(), unique()];
        await db.sessions.create(session(a));
        await db.sessions.create(session(b));
        await db.users.setPassword(user.id, 'new-hash');
        await db.sessions.deleteForUser(user.id);

        await expect(db.users.findByEmail(user.email)).resolves.toMatchObject({
          passwordHash: 'new-hash',
        });
        await expect(db.sessions.find(a)).resolves.toBeNull();
        await expect(db.sessions.find(b)).resolves.toBeNull();
      });

      it('uses a reset once, and only before it expires', async () => {
        const once = unique();
        await db.passwordResets.create(reset(once));
        await expect(db.passwordResets.consume(once, before)).resolves.toBe(
          user.id,
        );
        await expect(
          db.passwordResets.consume(once, before),
        ).resolves.toBeNull();

        const late = unique();
        await db.passwordResets.create(reset(late));
        await expect(
          db.passwordResets.consume(late, '2030-01-01T01:00:00.000Z'),
        ).resolves.toBeNull();
        await expect(
          db.passwordResets.consume('no-such-reset', before),
        ).resolves.toBeNull();
      });

      it('keeps only the newest unused reset', async () => {
        const [older, newer] = [unique(), unique()];
        await db.passwordResets.create(reset(older));
        await db.passwordResets.create(reset(newer));
        await expect(
          db.passwordResets.consume(older, before),
        ).resolves.toBeNull();
        await expect(db.passwordResets.consume(newer, before)).resolves.toBe(
          user.id,
        );
      });

      it('gives a reset to only one of two racing requests', async () => {
        const raced = unique();
        await db.passwordResets.create(reset(raced));
        const winners = await Promise.all([
          db.passwordResets.consume(raced, before),
          db.passwordResets.consume(raced, before),
        ]);
        expect(winners.filter(Boolean)).toEqual([user.id]);
      });
    });

    describe('workspaces', () => {
      it('reads the workspace', async () => {
        const workspace = await db.workspaces.get(ws);
        expect(workspaceSchema.parse(workspace)).toEqual(demo.workspace);
      });

      it('returns null and empty lists for another workspace', async () => {
        await expect(db.workspaces.get('elsewhere')).resolves.toBeNull();
        await expect(db.clients.list('elsewhere')).resolves.toEqual([]);
        await expect(db.attention.list('elsewhere')).resolves.toEqual([]);
        await expect(db.reports.listSummaries('elsewhere')).resolves.toEqual(
          [],
        );
        await expect(
          db.clients.get('elsewhere', 'harbour-dental'),
        ).resolves.toBeNull();
      });
    });

    describe('clients', () => {
      it('lists clients by name', async () => {
        const clients = await db.clients.list(ws);
        expect(z.array(clientSchema).parse(clients)).toEqual(expected.clients);
      });

      it('reads one client, or null', async () => {
        await expect(db.clients.get(ws, 'harbour-dental')).resolves.toEqual(
          demo.clients.find((c) => c.id === 'harbour-dental'),
        );
        await expect(db.clients.get(ws, 'no-such-client')).resolves.toBeNull();
      });

      it('builds the overview, most urgent first', async () => {
        await expect(db.clients.overview(ws)).resolves.toEqual(
          expected.overview,
        );
      });

      it('lists recently opened clients and records views', async () => {
        await expect(db.clients.recent(ws, 3)).resolves.toEqual(
          expected.recent.slice(0, 3),
        );

        const third = demo.clientViews.toSorted((a, b) =>
          compareText(b.viewedAt, a.viewedAt),
        )[2]!;
        try {
          await expect(
            db.clients.recordView(
              ws,
              third.clientId,
              '2030-01-01T00:00:00.000Z',
            ),
          ).resolves.toBe(true);
          const [first] = await db.clients.recent(ws, 1);
          expect(first?.id).toBe(third.clientId);
        } finally {
          await db.clients.recordView(ws, third.clientId, third.viewedAt);
        }
        await expect(db.clients.recent(ws, 20)).resolves.toEqual(
          expected.recent,
        );
        await expect(
          db.clients.recordView(
            ws,
            'no-such-client',
            '2030-01-01T00:00:00.000Z',
          ),
        ).resolves.toBe(false);
      });
    });

    describe('attention, recommendations, commitments', () => {
      it('lists attention items most urgent first, optionally for one client', async () => {
        const all = await db.attention.list(ws);
        expect(z.array(attentionItemSchema).parse(all)).toEqual(
          [...demo.attentionItems].sort(byAttention),
        );
        await expect(
          db.attention.list(ws, { clientId: 'harbour-dental' }),
        ).resolves.toEqual(
          demo.attentionItems
            .filter(forClient('harbour-dental'))
            .sort(byAttention),
        );
      });

      it('lists recommendations newest first, with filters', async () => {
        const all = await db.recommendations.list(ws);
        expect(z.array(recommendationSchema).parse(all)).toEqual(
          [...demo.recommendations].sort(byRecommendation),
        );
        await expect(
          db.recommendations.list(ws, {
            clientId: 'harbour-dental',
            status: 'draft',
          }),
        ).resolves.toEqual(
          demo.recommendations
            .filter(
              (r) => r.clientId === 'harbour-dental' && r.status === 'draft',
            )
            .sort(byRecommendation),
        );
      });

      it('updates a recommendation and reads it back', async () => {
        const original = demo.recommendations[0]!;
        try {
          const updated = await db.recommendations.update(ws, original.id, {
            status: 'accepted',
            title: 'Edited title',
            decidedAt: '2030-01-01T00:00:00.000Z',
          });
          expect(updated).toEqual({
            ...original,
            status: 'accepted',
            title: 'Edited title',
            decidedAt: '2030-01-01T00:00:00.000Z',
          });
          await expect(
            db.recommendations.get(ws, original.id),
          ).resolves.toEqual(updated);
        } finally {
          await db.recommendations.update(ws, original.id, {
            status: original.status,
            title: original.title,
            reason: original.reason,
            decidedAt: original.decidedAt,
          });
        }
        await expect(db.recommendations.get(ws, original.id)).resolves.toEqual(
          original,
        );
        await expect(
          db.recommendations.update(ws, 'no-such-rec', { title: 'x' }),
        ).resolves.toBeNull();
      });

      it('lists commitments, open first', async () => {
        const all = await db.commitments.list(ws);
        expect(z.array(commitmentSchema).parse(all)).toEqual(
          [...demo.commitments].sort(byCommitment),
        );
      });
    });

    describe('meetings, devices and tickets', () => {
      it('lists meetings newest first', async () => {
        const all = await db.meetings.list(ws, { clientId: 'harbour-dental' });
        expect(z.array(meetingSchema).parse(all)).toEqual(
          demo.meetings.filter(forClient('harbour-dental')).sort(byMeeting),
        );
        await expect(db.meetings.list(ws)).resolves.toHaveLength(
          demo.meetings.length,
        );
      });

      it('lists devices needing work first', async () => {
        const all = await db.devices.list(ws, { clientId: 'harbour-dental' });
        expect(z.array(deviceSchema).parse(all)).toEqual(
          demo.devices.filter(forClient('harbour-dental')).sort(byDevice),
        );
        await expect(db.devices.list(ws)).resolves.toHaveLength(
          demo.devices.length,
        );
      });

      it('lists open tickets first, the most urgent first', async () => {
        const all = await db.tickets.list(ws, { clientId: 'harbour-dental' });
        expect(z.array(ticketSchema).parse(all)).toEqual(
          demo.tickets.filter(forClient('harbour-dental')).sort(byTicket),
        );
        await expect(db.tickets.list(ws)).resolves.toEqual(
          [...demo.tickets].sort(byTicket),
        );
      });
    });

    describe('reports', () => {
      const drafts = demo.reports.filter((r) => r.status === 'draft');

      it('lists summaries newest week first, with filters', async () => {
        await expect(db.reports.listSummaries(ws)).resolves.toEqual(
          demo.reports.map(toSummary).sort(byReportWeek(clientName)),
        );
        await expect(
          db.reports.listSummaries(ws, { status: 'draft' }),
        ).resolves.toEqual(
          drafts.map(toSummary).sort(byReportWeek(clientName)),
        );
        await expect(
          db.reports.listSummaries(ws, { clientId: 'harbour-dental' }),
        ).resolves.toEqual(
          demo.reports
            .filter(forClient('harbour-dental'))
            .map(toSummary)
            .sort(byReportWeek(clientName)),
        );
      });

      it('reads a whole report', async () => {
        const report = await db.reports.get(ws, 'harbour-dental-2026-w41');
        expect(reportSchema.parse(report)).toEqual(
          demo.reports.find((r) => r.id === 'harbour-dental-2026-w41'),
        );
        await expect(db.reports.get(ws, 'no-such-report')).resolves.toBeNull();
      });

      it('sets status in bulk and puts it back', async () => {
        const ids = [drafts[1]!.id, drafts[0]!.id, 'no-such-report'];
        const at = '2030-01-01T00:00:00.000Z';
        try {
          const approved = await db.reports.setStatus(ws, ids, 'approved', at);
          expect(approved.map((r) => [r.id, r.status, r.approvedAt])).toEqual([
            [drafts[1]!.id, 'approved', at],
            [drafts[0]!.id, 'approved', at],
          ]);
          await expect(
            db.reports.get(ws, drafts[0]!.id),
          ).resolves.toMatchObject({
            status: 'approved',
            approvedAt: at,
          });
        } finally {
          await db.reports.setStatus(ws, ids, 'draft', at);
        }
        await expect(db.reports.get(ws, drafts[0]!.id)).resolves.toEqual(
          drafts[0],
        );
      });
    });

    describe('sources, connectors, audit', () => {
      it('reads sources in the order asked, skipping unknown IDs', async () => {
        const ids = [
          'src-hd-call-restore-ask',
          'no-such-source',
          'src-hd-alert-48213',
        ];
        const sources = await db.sources.getMany(ws, ids);
        expect(
          z
            .array(sourceSchema)
            .parse(sources)
            .map((s) => s.id),
        ).toEqual(['src-hd-call-restore-ask', 'src-hd-alert-48213']);
        expect(sources).toEqual(
          ['src-hd-call-restore-ask', 'src-hd-alert-48213'].map((id) =>
            demo.sources.find((s) => s.id === id),
          ),
        );
        await expect(db.sources.getMany(ws, [])).resolves.toEqual([]);
      });

      it("lists a client's sources newest first", async () => {
        await expect(
          db.sources.listForClient(ws, 'harbour-dental'),
        ).resolves.toEqual(
          demo.sources
            .filter(forClient('harbour-dental'))
            .sort(bySourceRecency),
        );
      });

      it('lists connectors in tool order', async () => {
        const connectors = await db.connectors.list(ws);
        expect(z.array(connectorSchema).parse(connectors)).toEqual(
          [...demo.connectors].sort(byTool),
        );
      });

      it('reads the audit log newest first, with filters', async () => {
        const all = await db.audit.list(ws);
        expect(z.array(auditEntrySchema).parse(all)).toEqual(
          [...demo.auditLog].sort(byAuditRecency).slice(0, AUDIT_PAGE_SIZE),
        );
        await expect(db.audit.list(ws, { tool: 'hudu' })).resolves.toEqual(
          demo.auditLog.filter((e) => e.tool === 'hudu').sort(byAuditRecency),
        );
        await expect(
          db.audit.list(ws, { clientId: 'marlow-freight' }),
        ).resolves.toEqual(
          demo.auditLog
            .filter(
              (e) => e.clientId === 'marlow-freight' || e.clientId === null,
            )
            .sort(byAuditRecency),
        );
      });

      it('pages through the audit log both ways, across equal times', async () => {
        const newestFirst = [...demo.auditLog].sort(byAuditRecency);
        // One entry a page crosses every boundary, including the ties.
        const older: AuditEntry[] = await db.audit.list(ws, { limit: 1 });
        for (;;) {
          const page = await db.audit.list(ws, {
            before: older.at(-1)!,
            limit: 1,
          });
          if (page.length === 0) break;
          older.push(...page);
        }
        expect(older).toEqual(newestFirst);

        const newer: AuditEntry[] = [newestFirst.at(-1)!];
        for (;;) {
          const page = await db.audit.list(ws, { after: newer[0]!, limit: 1 });
          if (page.length === 0) break;
          newer.unshift(...page);
        }
        expect(newer).toEqual(newestFirst);

        // A page holds the entries next to the position, filters still apply.
        const hudu = newestFirst.filter((e) => e.tool === 'hudu');
        await expect(
          db.audit.list(ws, { tool: 'hudu', before: hudu[2]!, limit: 3 }),
        ).resolves.toEqual(hudu.slice(3, 6));
        await expect(
          db.audit.list(ws, { tool: 'hudu', after: hudu[5]!, limit: 3 }),
        ).resolves.toEqual(hudu.slice(2, 5));
        const marlow = newestFirst.filter(
          (e) => e.clientId === 'marlow-freight' || e.clientId === null,
        );
        await expect(
          db.audit.list(ws, {
            clientId: 'marlow-freight',
            before: marlow[1]!,
            limit: 2,
          }),
        ).resolves.toEqual(marlow.slice(2, 4));
        await expect(
          db.audit.list(ws, { after: newestFirst[0]! }),
        ).resolves.toEqual([]);
      });

      it('counts the audit log by tool', async () => {
        const counts = (keep: (e: AuditEntry) => boolean) =>
          toolSchema.options.map((tool) => ({
            tool,
            count: demo.auditLog.filter((e) => e.tool === tool && keep(e))
              .length,
          }));
        await expect(db.audit.counts(ws)).resolves.toEqual(counts(() => true));
        await expect(
          db.audit.counts(ws, { clientId: 'marlow-freight' }),
        ).resolves.toEqual(
          counts((e) => e.clientId === 'marlow-freight' || e.clientId === null),
        );
      });
    });
  });
}

/**
 * Writes a sync makes, in a scratch workspace so the demo stays as it is. IDs
 * are prefixed with the workspace ID because SQL primary keys are global.
 */
function describeSyncWrites(getDb: () => DatabaseAdapter) {
  describe('sync writes (scratch workspace)', () => {
    const scratch = {
      id: `${SCRATCH_PREFIX}${Math.random().toString(36).slice(2, 10)}`,
      name: 'Scratch',
      timeZone: 'Europe/London',
    };
    const ws = scratch.id;
    const at = '2030-01-01T00:00:00.000Z';
    const later = '2030-01-02T00:00:00.000Z';
    const id = (suffix: string) => `${ws}-${suffix}`;

    const client = (key: string, name: string): Client => ({
      id: id(key),
      name,
      industry: null,
      location: null,
      seats: null,
      primaryContact: null,
      contract: null,
      domains: [`${key}.example`],
    });
    const acme = client('acme', 'Acme Accountants');
    const beta = client('beta', 'Beta Builders');
    const link = (c: Client, tool: Tool, externalId: string): ClientLink => ({
      tool,
      externalId,
      clientId: c.id,
      name: c.name,
      url: `https://${tool}.example/${externalId}`,
    });

    const record = (key: string, tool: Tool, clientId: string | null) =>
      ({
        id: id(key),
        kind: 'record',
        clientId,
        tool,
        recordId: key.toUpperCase(),
        recordType: 'Device',
        title: `Record ${key}`,
        recordedAt: at,
        url: `https://${tool}.example/${key}`,
        fields: [{ label: 'OS', value: 'Windows 11' }],
      }) satisfies Source;
    const deviceSource = record('device-src', 'ninjaone', acme.id);
    const device: Device = {
      id: id('device'),
      clientId: acme.id,
      name: 'ACME-PC1',
      type: 'workstation',
      os: 'Windows 11 Pro',
      assignedTo: 'ann',
      lastSeenAt: at,
      patchStatus: 'failed',
      sourceId: deviceSource.id,
    };
    const ticketSource = {
      ...record('ticket-src', 'ninjaone', acme.id),
      recordType: 'Ticket',
    };
    const ticket: Ticket = {
      id: id('ticket'),
      clientId: acme.id,
      number: '4821',
      subject: 'Printer offline',
      status: 'Open',
      open: true,
      urgency: 'high',
      requester: 'Ann Lee',
      assignedTo: null,
      openedAt: at,
      updatedAt: at,
      sourceId: ticketSource.id,
    };
    const alert: AttentionItem = {
      id: id('alert'),
      clientId: acme.id,
      kind: 'alert',
      urgency: 'critical',
      title: 'Disk almost full',
      raisedAt: at,
      sourceIds: [deviceSource.id],
    };
    const recording = record('recording', 'fathom', acme.id);
    const quote: Source = {
      ...record('quote', 'fathom', acme.id),
      kind: 'meeting',
      tool: 'fathom',
      meetingId: id('meeting'),
      transcriptAt: '00:01:02',
      speakerRole: 'client',
      speakerName: 'Ann Lee',
      quote: 'Can you look at the backups?',
    };
    const meeting: Meeting = {
      id: id('meeting'),
      clientId: acme.id,
      title: 'Monthly check-in',
      occurredAt: at,
      durationMinutes: 30,
      attendees: [{ name: 'Ann Lee', role: 'client' }],
      planning: [],
      concerns: [],
      askedFor: [{ text: 'Check the backups', sourceIds: [quote.id] }],
      recordingSourceId: recording.id,
    };
    const commitment: Commitment = {
      id: id('commitment'),
      clientId: acme.id,
      statement: 'Check the backups',
      madeAt: at,
      dueOn: '2030-02-01',
      status: 'open',
      completedAt: null,
      sourceIds: [quote.id],
    };
    const none = {
      sources: [],
      devices: [],
      tickets: [],
      meetings: [],
      commitments: [],
      attention: [],
    };

    beforeAll(async () => {
      await getDb().workspaces.create(scratch);
    });

    it('creates a workspace', async () => {
      await expect(getDb().workspaces.get(ws)).resolves.toEqual(scratch);
    });

    it('syncs clients and links, and drops clients no tool links', async () => {
      const db = getDb();
      await db.clients.sync(
        ws,
        'ninjaone',
        {
          clients: [beta, acme],
          links: [link(acme, 'ninjaone', '1'), link(beta, 'ninjaone', '2')],
        },
        at,
      );
      await expect(db.clients.list(ws)).resolves.toEqual([acme, beta]);
      await expect(db.clients.links(ws)).resolves.toEqual([
        link(acme, 'ninjaone', '1'),
        link(beta, 'ninjaone', '2'),
      ]);

      // Hudu links Acme too, and knows where it is.
      const located = { ...acme, location: 'York' };
      await db.clients.sync(
        ws,
        'hudu',
        { clients: [located], links: [link(acme, 'hudu', 'h1')] },
        at,
      );
      await expect(db.clients.get(ws, acme.id)).resolves.toEqual(located);

      // NinjaOne no longer has either: Beta goes, Acme stays for Hudu.
      await db.clients.sync(ws, 'ninjaone', { clients: [], links: [] }, at);
      await expect(db.clients.list(ws)).resolves.toEqual([located]);
      await expect(db.clients.links(ws)).resolves.toEqual([
        link(acme, 'hudu', 'h1'),
      ]);
    });

    it('never overwrites a contract from a sync', async () => {
      const db = getDb();
      const contract = {
        plan: 'Managed',
        startedOn: '2029-01-01',
        renewsOn: '2031-01-01',
        monthlyFee: 1200,
        currency: 'GBP',
        includes: ['Helpdesk'],
      };
      const gamma = { ...client('gamma', 'Gamma Galleries'), contract };
      await db.clients.sync(
        ws,
        'hudu',
        {
          clients: [gamma],
          links: [link(acme, 'hudu', 'h1'), link(gamma, 'hudu', 'h2')],
        },
        at,
      );
      await db.clients.sync(
        ws,
        'hudu',
        {
          clients: [{ ...gamma, contract: null, name: 'Gamma Gallery' }],
          links: [link(acme, 'hudu', 'h1'), link(gamma, 'hudu', 'h2')],
        },
        at,
      );
      await expect(db.clients.get(ws, gamma.id)).resolves.toEqual({
        ...gamma,
        name: 'Gamma Gallery',
      });
    });

    it("replaces one tool's records and leaves the others", async () => {
      const db = getDb();
      await db.records.replace(ws, 'ninjaone', {
        ...none,
        sources: [deviceSource, ticketSource],
        devices: [device],
        tickets: [ticket],
        attention: [alert],
      });
      await db.records.replace(ws, 'fathom', {
        ...none,
        sources: [recording, quote],
        meetings: [meeting],
        commitments: [commitment],
      });

      const sources = await db.sources.listForClient(ws, acme.id);
      expect(z.array(sourceSchema).parse(sources)).toEqual(
        [deviceSource, ticketSource, recording, quote].sort(bySourceRecency),
      );
      await expect(db.devices.list(ws)).resolves.toEqual([device]);
      await expect(db.tickets.list(ws)).resolves.toEqual([ticket]);
      await expect(db.attention.list(ws)).resolves.toEqual([alert]);
      await expect(db.meetings.list(ws)).resolves.toEqual([meeting]);
      await expect(db.commitments.list(ws)).resolves.toEqual([commitment]);

      // A second NinjaOne sync with fewer records swaps only NinjaOne's.
      const healthy = { ...device, patchStatus: 'current' as const };
      const closed = {
        ...ticket,
        status: 'Closed',
        open: false,
        updatedAt: later,
      };
      await db.records.replace(ws, 'ninjaone', {
        ...none,
        sources: [deviceSource, ticketSource],
        devices: [healthy],
        tickets: [closed],
      });
      await expect(db.devices.list(ws)).resolves.toEqual([healthy]);
      await expect(db.tickets.list(ws)).resolves.toEqual([closed]);
      await expect(db.attention.list(ws)).resolves.toEqual([]);
      await expect(db.meetings.list(ws)).resolves.toEqual([meeting]);
      await expect(db.sources.getMany(ws, [quote.id])).resolves.toEqual([
        quote,
      ]);
    });

    it('keeps report questions for every client or one', async () => {
      const db = getDb();
      const everyone = {
        id: id('question-all'),
        clientId: null,
        text: 'Is anyone still on Windows 10?',
        createdAt: at,
      };
      const forAcme = {
        id: id('question-acme'),
        clientId: acme.id,
        text: 'How are the backups of the accounts server doing?',
        createdAt: later,
      };
      await db.reportQuestions.create(ws, forAcme);
      await db.reportQuestions.create(ws, everyone);

      await expect(db.reportQuestions.list(ws)).resolves.toEqual([
        everyone,
        forAcme,
      ]);
      await expect(
        db.reportQuestions.list(ws, { clientId: acme.id }),
      ).resolves.toEqual([everyone, forAcme]);
      await expect(
        db.reportQuestions.list(ws, { clientId: 'someone-else' }),
      ).resolves.toEqual([everyone]);
      await expect(db.reportQuestions.list('elsewhere')).resolves.toEqual([]);

      await expect(
        db.reportQuestions.update(ws, forAcme.id, {
          text: 'Did every backup succeed?',
          clientId: null,
        }),
      ).resolves.toEqual({
        ...forAcme,
        text: 'Did every backup succeed?',
        clientId: null,
      });
      await expect(
        db.reportQuestions.update(ws, 'no-such-question', { text: 'x' }),
      ).resolves.toBeNull();

      await expect(db.reportQuestions.remove(ws, forAcme.id)).resolves.toBe(
        true,
      );
      await expect(db.reportQuestions.remove(ws, forAcme.id)).resolves.toBe(
        false,
      );
      await expect(db.reportQuestions.remove(ws, everyone.id)).resolves.toBe(
        true,
      );
      await expect(db.reportQuestions.list(ws)).resolves.toEqual([]);
    });

    it('saves a report with its sources, and replaces it by ID', async () => {
      const db = getDb();
      const report: Report = {
        id: id('report'),
        clientId: acme.id,
        weekStart: '2029-12-31',
        weekEnd: '2030-01-06',
        status: 'draft',
        generatedAt: at,
        approvedAt: null,
        exceptions: ['Patches failed to install on ACME-PC1'],
        title: 'Acme Accountants weekly report',
        glance: [{ label: 'Devices', value: '1', note: 'none urgent' }],
        sections: [
          {
            kind: 'devices',
            title: 'Devices and patching',
            lines: [
              {
                id: 'line-1',
                text: 'Patches failed to install on ACME-PC1.',
                sourceIds: [deviceSource.id, quote.id],
              },
            ],
          },
        ],
        sources: [deviceSource, quote],
      };
      await db.reports.save(ws, report);
      expect(reportSchema.parse(await db.reports.get(ws, report.id))).toEqual(
        report,
      );

      const redrafted: Report = {
        ...report,
        generatedAt: later,
        exceptions: [],
        sections: [],
        sources: [],
      };
      await db.reports.save(ws, redrafted);
      await expect(db.reports.get(ws, report.id)).resolves.toEqual(redrafted);
      await expect(db.reports.listSummaries(ws)).resolves.toEqual([
        toSummary(redrafted),
      ]);
    });

    it('adds records without touching the rest', async () => {
      const db = getDb();
      const log = {
        ...record('sync-log', 'ninjaone', null),
        recordType: 'Sync log',
      };
      const failing: AttentionItem = {
        id: id('connection'),
        clientId: null,
        kind: 'connection',
        urgency: 'high',
        title: 'NinjaOne has not synced',
        raisedAt: later,
        sourceIds: [log.id],
      };
      await db.records.upsert(ws, 'ninjaone', {
        sources: [log],
        attention: [failing],
      });
      await db.records.upsert(ws, 'ninjaone', {
        sources: [log],
        attention: [{ ...failing, urgency: 'critical' }],
      });
      await expect(db.attention.list(ws)).resolves.toEqual([
        { ...failing, urgency: 'critical' },
      ]);
      await expect(db.devices.list(ws)).resolves.toHaveLength(1);

      // The next good sync clears it.
      await db.records.replace(ws, 'ninjaone', {
        ...none,
        sources: [deviceSource],
        devices: [device],
      });
      await expect(db.attention.list(ws)).resolves.toEqual([]);
      await expect(db.sources.getMany(ws, [log.id])).resolves.toEqual([]);
    });

    it('removes everything a tool wrote, with the clients only it linked', async () => {
      const db = getDb();
      const delta = client('delta', 'Delta Dental');
      await db.clients.sync(
        ws,
        'sharepoint',
        { clients: [delta], links: [link(delta, 'sharepoint', 'f1')] },
        at,
      );
      await db.records.replace(ws, 'sharepoint', {
        ...none,
        sources: [record('file', 'sharepoint', delta.id)],
      });
      // A NinjaOne ticket at Delta goes with Delta; Acme's stays.
      const deltaTicketSource = {
        ...record('delta-ticket-src', 'ninjaone', delta.id),
        recordType: 'Ticket',
      };
      const deltaTicket: Ticket = {
        ...ticket,
        id: id('delta-ticket'),
        clientId: delta.id,
        sourceId: deltaTicketSource.id,
      };
      await db.records.replace(ws, 'ninjaone', {
        ...none,
        sources: [deviceSource, ticketSource, deltaTicketSource],
        devices: [device],
        tickets: [ticket, deltaTicket],
      });

      await db.records.removeTool(ws, 'sharepoint');
      await expect(db.clients.get(ws, delta.id)).resolves.toBeNull();
      await expect(db.sources.getMany(ws, [id('file')])).resolves.toEqual([]);
      await expect(db.devices.list(ws)).resolves.toEqual([device]);
      await expect(db.tickets.list(ws)).resolves.toEqual([ticket]);

      await db.records.removeTool(ws, 'fathom');
      await expect(db.meetings.list(ws)).resolves.toEqual([]);
      await expect(db.commitments.list(ws)).resolves.toEqual([]);
      await expect(db.clients.get(ws, acme.id)).resolves.not.toBeNull();

      await db.records.removeTool(ws, 'ninjaone');
      await expect(db.tickets.list(ws)).resolves.toEqual([]);
      await expect(db.devices.list(ws)).resolves.toEqual([]);
    });

    it('saves, updates and removes a connector, keeping secrets out of lists', async () => {
      const db = getDb();
      const connector: ConnectorRecord = {
        id: id('hudu'),
        tool: 'hudu',
        account: 'scratch.huducloud.com',
        scope: 'Documentation',
        access: 'read: companies, assets',
        status: 'syncing',
        lastSyncAt: null,
        failure: null,
        credentials: 'v1.not-really-encrypted',
        state: { cursor: 'abc' },
      };
      await db.connectors.save(ws, connector);
      await expect(db.connectors.get(ws, 'hudu')).resolves.toEqual(connector);
      const [listed] = await db.connectors.list(ws);
      expect(connectorSchema.strict().parse(listed)).toEqual(
        connectorSchema.parse(connector),
      );
      await expect(db.connectors.listAll()).resolves.toContainEqual({
        workspaceId: ws,
        tool: 'hudu',
      });

      const failure = {
        since: later,
        summary: 'Hudu refused the API key.',
        fix: 'Update the key',
      };
      await expect(
        db.connectors.update(ws, 'hudu', {
          status: 'failing',
          failure,
          state: { cursor: 'def' },
        }),
      ).resolves.toEqual({
        ...connector,
        status: 'failing',
        failure,
        state: { cursor: 'def' },
      });
      await expect(
        db.connectors.update(ws, 'hudu', {
          status: 'healthy',
          failure: null,
          lastSyncAt: later,
        }),
      ).resolves.toMatchObject({
        status: 'healthy',
        failure: null,
        lastSyncAt: later,
      });

      await db.connectors.save(ws, { ...connector, account: 'other.example' });
      await expect(db.connectors.get(ws, 'hudu')).resolves.toEqual({
        ...connector,
        account: 'other.example',
      });

      await db.connectors.remove(ws, 'hudu');
      await expect(db.connectors.get(ws, 'hudu')).resolves.toBeNull();
      await expect(db.connectors.list(ws)).resolves.toEqual([]);
      await expect(
        db.connectors.update(ws, 'hudu', { status: 'healthy' }),
      ).resolves.toBeNull();
    });

    it('appends to and prunes the audit log', async () => {
      const db = getDb();
      const entry = (key: string, when: string) => ({
        id: id(key),
        at: when,
        tool: 'ninjaone' as const,
        read: 'Devices',
        clientId: null,
        recordCount: 12,
      });
      await db.audit.append(ws, [entry('a1', at), entry('a2', later)]);
      await db.audit.append(ws, []);
      await expect(db.audit.list(ws)).resolves.toEqual([
        entry('a2', later),
        entry('a1', at),
      ]);
      await expect(db.audit.counts(ws)).resolves.toEqual([
        { tool: 'ninjaone', count: 2 },
        { tool: 'hudu', count: 0 },
        { tool: 'sharepoint', count: 0 },
        { tool: 'fathom', count: 0 },
      ]);
      await db.audit.prune(ws, later);
      await expect(db.audit.list(ws)).resolves.toEqual([entry('a2', later)]);
    });

    it('replaces drafts a run made, keeping decided and edited ones', async () => {
      const db = getDb();
      const draft = (key: string, title: string): Recommendation => ({
        id: id(key),
        clientId: acme.id,
        status: 'draft',
        title,
        reason: 'The records say so.',
        createdAt: at,
        decidedAt: null,
        sourceIds: [deviceSource.id],
      });
      const first = [
        draft('rec-1', 'Replace the disk in ACME-PC1'),
        draft('rec-2', 'Call Ann about the backups'),
        draft('rec-3', 'Renew acme.example'),
      ];
      await db.recommendations.replaceDrafts(ws, acme.id, 'run-1', first);
      await expect(
        db.recommendations.list(ws, { clientId: acme.id }),
      ).resolves.toEqual(first);

      // Someone accepts one and rewords another; the next run swaps the third.
      const accepted = await db.recommendations.update(ws, id('rec-1'), {
        status: 'accepted',
        decidedAt: later,
      });
      const reworded = await db.recommendations.update(ws, id('rec-2'), {
        title: 'Call Ann on Monday about the backups',
      });
      const next = [draft('rec-4', 'Test a restore of the file share')];
      await db.recommendations.replaceDrafts(ws, acme.id, 'run-2', next);
      await expect(
        db.recommendations.list(ws, { clientId: acme.id }),
      ).resolves.toEqual([accepted, reworded, ...next]);
    });

    it('keeps the model a workspace chose, and what each run cost', async () => {
      const db = getDb();
      await expect(db.intelligence.model(ws)).resolves.toBeNull();
      await db.intelligence.setModel(ws, 'claude-sonnet-5-5');
      await expect(db.intelligence.model(ws)).resolves.toBe(
        'claude-sonnet-5-5',
      );
      await db.intelligence.setModel(ws, null);
      await expect(db.intelligence.model(ws)).resolves.toBeNull();

      await expect(db.intelligence.preferences(ws)).resolves.toEqual({});
      const preferences = {
        outputs: { ask: false },
        records: { tickets: false, files: false },
      };
      await db.intelligence.setPreferences(ws, preferences);
      await expect(db.intelligence.preferences(ws)).resolves.toEqual(
        preferences,
      );

      const run = (
        key: string,
        startedAt: string,
        clientId: string | null,
      ): IntelligenceRun => ({
        id: id(key),
        clientId,
        kind: 'recommendations',
        inputHash: `hash-${key}`,
        model: 'claude-opus-5-5',
        usage: {
          inputTokens: 1200,
          outputTokens: 2000,
          cacheReadTokens: 0,
          cacheWriteTokens: 20000,
        },
        cost: 0.1448,
        status: 'ok',
        error: null,
        startedAt,
        finishedAt: startedAt,
      });
      const older = run('run-1', at, acme.id);
      const newer = run('run-2', later, acme.id);
      const across = {
        ...run('run-3', later, null),
        kind: 'patterns' as const,
      };
      for (const saved of [older, newer, across]) {
        await db.intelligence.saveRun(ws, saved);
      }
      await expect(
        db.intelligence.lastRun(ws, 'recommendations', acme.id),
      ).resolves.toEqual(newer);
      await expect(
        db.intelligence.lastRun(ws, 'patterns', null),
      ).resolves.toEqual(across);
      await expect(
        db.intelligence.lastRun(ws, 'recommendations', null),
      ).resolves.toBeNull();
      await expect(db.intelligence.runs(ws, later)).resolves.toEqual([
        newer,
        across,
      ]);
      await expect(db.intelligence.runs(ws, at)).resolves.toHaveLength(3);
    });
  });
}
