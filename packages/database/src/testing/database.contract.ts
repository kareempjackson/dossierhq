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
  userSchema,
  workspaceSchema,
  type AttentionItem,
  type Client,
  type ClientListItem,
  type Commitment,
  type Device,
  type Meeting,
  type Source,
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
  byTool,
  compareText,
  toSummary,
} from '../ordering.js';
import {
  AUDIT_PAGE_SIZE,
  type ClientLink,
  type ConnectorRecord,
  type DatabaseAdapter,
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

    describe('first-run setup', () => {
      it('only creates the first owner while there are no users', async () => {
        await expect(db.users.any()).resolves.toBe(true);
        const workspace = {
          id: `${SCRATCH_PREFIX}first-run`,
          name: 'First run',
          timeZone: 'UTC',
        };
        await expect(
          db.users.createFirstOwner(workspace, {
            id: 'usr-contract-first-run',
            email: 'first-run@example.com',
            name: 'First Run',
            title: '',
            passwordHash: 'not-a-real-hash',
          }),
        ).resolves.toBe(false);
        await expect(db.workspaces.get(workspace.id)).resolves.toBeNull();
        await expect(
          db.users.findByEmail('first-run@example.com'),
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

    describe('meetings and devices', () => {
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
        sources: [deviceSource],
        devices: [device],
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
        [deviceSource, recording, quote].sort(bySourceRecency),
      );
      await expect(db.devices.list(ws)).resolves.toEqual([device]);
      await expect(db.attention.list(ws)).resolves.toEqual([alert]);
      await expect(db.meetings.list(ws)).resolves.toEqual([meeting]);
      await expect(db.commitments.list(ws)).resolves.toEqual([commitment]);

      // A second NinjaOne sync with fewer records swaps only NinjaOne's.
      const healthy = { ...device, patchStatus: 'current' as const };
      await db.records.replace(ws, 'ninjaone', {
        ...none,
        sources: [deviceSource],
        devices: [healthy],
      });
      await expect(db.devices.list(ws)).resolves.toEqual([healthy]);
      await expect(db.attention.list(ws)).resolves.toEqual([]);
      await expect(db.meetings.list(ws)).resolves.toEqual([meeting]);
      await expect(db.sources.getMany(ws, [quote.id])).resolves.toEqual([
        quote,
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

      await db.records.removeTool(ws, 'sharepoint');
      await expect(db.clients.get(ws, delta.id)).resolves.toBeNull();
      await expect(db.sources.getMany(ws, [id('file')])).resolves.toEqual([]);
      await expect(db.devices.list(ws)).resolves.toEqual([device]);

      await db.records.removeTool(ws, 'fathom');
      await expect(db.meetings.list(ws)).resolves.toEqual([]);
      await expect(db.commitments.list(ws)).resolves.toEqual([]);
      await expect(db.clients.get(ws, acme.id)).resolves.not.toBeNull();
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
      await db.audit.prune(ws, later);
      await expect(db.audit.list(ws)).resolves.toEqual([entry('a2', later)]);
    });
  });
}
