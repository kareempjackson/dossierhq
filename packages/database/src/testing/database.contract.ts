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
  workspaceSchema,
  type ClientListItem,
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
import { AUDIT_PAGE_SIZE, type DatabaseAdapter } from '../types.js';

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
 * SQL adapters need the database in its seeded state (`pnpm db:reset`). Tests
 * that write put things back afterwards.
 */
export function describeDatabaseContract(
  name: string,
  setup: () => Promise<DatabaseAdapter>,
  { skip = false }: { skip?: boolean } = {},
) {
  describe.skipIf(skip)(`${name} adapter: database contract`, () => {
    let db: DatabaseAdapter;

    beforeAll(async () => {
      db = await setup();
      await db.ping();
    });

    afterAll(async () => {
      await db?.close();
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
