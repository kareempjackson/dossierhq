import {
  clientListItemSchema,
  clientSchema,
  connectorSchema,
  listOf,
  recommendationSchema,
  reportSchema,
  reportSummarySchema,
  sourceSchema,
} from '@dossierhq/contracts';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

const NOW = '2026-10-09T15:40:00.000Z';

// Boots the real AppModule on the in-memory adapter (demo workspace, pinned
// clock; see vitest.config.e2e.ts) and exercises it over HTTP.
describe('API (e2e)', () => {
  let app: INestApplication;
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports health, the workspace and the clock', async () => {
    await api()
      .get('/health')
      .expect(200)
      .expect({ status: 'ok', database: { provider: 'memory', status: 'up' } });
    const workspace = await api().get('/workspace').expect(200);
    expect(workspace.body).toMatchObject({
      id: 'larkspur-it',
      name: 'Larkspur IT',
    });
    await api().get('/clock').expect(200).expect({ now: NOW });
  });

  describe('clients', () => {
    it('lists clients and the overview', async () => {
      const list = listOf(clientSchema).parse(
        (await api().get('/clients').expect(200)).body,
      );
      expect(list.data).toHaveLength(14);
      const overview = listOf(clientListItemSchema).parse(
        (await api().get('/clients/overview').expect(200)).body,
      );
      expect(overview.data[0]).toMatchObject({
        client: { id: 'harbour-dental' },
        attention: { total: 3, critical: 1 },
      });
    });

    it('records views for recent clients', async () => {
      await api().post('/clients/marlow-freight/views').expect(204);
      const recent = await api().get('/clients/recent?limit=2').expect(200);
      expect(recent.body.data.map((c: { id: string }) => c.id)[0]).toBe(
        'marlow-freight',
      );
      expect(recent.body.data).toHaveLength(2);
      await api().post('/clients/no-such-client/views').expect(404);
      await api().get('/clients/recent?limit=0').expect(400);
    });

    it('reads one client and its sources', async () => {
      await api().get('/clients/harbour-dental').expect(200);
      await api().get('/clients/no-such-client').expect(404);
      const sources = listOf(sourceSchema).parse(
        (await api().get('/clients/harbour-dental/sources').expect(200)).body,
      );
      expect(sources.data.length).toBeGreaterThan(20);
      await api().get('/clients/no-such-client/sources').expect(404);
    });

    it('lists meetings and devices for a client', async () => {
      const meetings = await api()
        .get('/meetings?clientId=harbour-dental')
        .expect(200);
      expect(meetings.body.data).toHaveLength(2);
      const devices = await api()
        .get('/devices?clientId=harbour-dental')
        .expect(200);
      expect(devices.body.data).toHaveLength(24);
      expect(devices.body.data[0].patchStatus).toBe('pending');
    });
  });

  describe('insights', () => {
    it('lists attention items and commitments', async () => {
      const attention = await api()
        .get('/attention?clientId=harbour-dental')
        .expect(200);
      expect(attention.body.data).toHaveLength(3);
      expect(attention.body.data[0].urgency).toBe('critical');
      const commitments = await api()
        .get('/commitments?clientId=harbour-dental')
        .expect(200);
      expect(commitments.body.data[0].status).toBe('open');
    });

    it('accepts, undoes and edits a recommendation', async () => {
      const drafts = await api()
        .get('/recommendations?status=draft')
        .expect(200);
      expect(drafts.body.data).toHaveLength(5);
      const id = 'rec-csc-extend-disk';

      const accepted = recommendationSchema.parse(
        (
          await api()
            .patch(`/recommendations/${id}`)
            .send({ status: 'accepted' })
            .expect(200)
        ).body,
      );
      expect(accepted).toMatchObject({ status: 'accepted', decidedAt: NOW });

      const undone = await api()
        .patch(`/recommendations/${id}`)
        .send({ status: 'draft' })
        .expect(200);
      expect(undone.body).toMatchObject({ status: 'draft', decidedAt: null });

      const edited = await api()
        .patch(`/recommendations/${id}`)
        .send({ title: '  Extend the disk by 250 GB  ' })
        .expect(200);
      expect(edited.body.title).toBe('Extend the disk by 250 GB');
    });

    it('rejects bad recommendation updates', async () => {
      await api()
        .patch('/recommendations/rec-csc-extend-disk')
        .send({})
        .expect(400);
      await api()
        .patch('/recommendations/rec-csc-extend-disk')
        .send({ status: 'archived' })
        .expect(400);
      await api()
        .patch('/recommendations/no-such-rec')
        .send({ status: 'accepted' })
        .expect(404);
    });
  });

  describe('reports', () => {
    it('lists the review queue, exceptions first', async () => {
      const queue = listOf(reportSummarySchema).parse(
        (await api().get('/reports/queue').expect(200)).body,
      );
      expect(queue.data).toHaveLength(14);
      expect(queue.data.slice(0, 4).every((r) => r.exceptions.length > 0)).toBe(
        true,
      );
      expect(queue.data.slice(4).every((r) => r.exceptions.length === 0)).toBe(
        true,
      );
      const approved = await api().get('/reports?status=approved').expect(200);
      expect(approved.body.data).toHaveLength(42);
    });

    it('reads a whole report', async () => {
      const report = reportSchema.parse(
        (await api().get('/reports/harbour-dental-2026-w41').expect(200)).body,
      );
      expect(report.sections.map((s) => s.kind)[0]).toBe('needs-attention');
      await api().get('/reports/no-such-report').expect(404);
    });

    it('approves one report and puts it back', async () => {
      const id = 'harbour-dental-2026-w41';
      const approved = await api()
        .patch(`/reports/${id}`)
        .send({ status: 'approved' })
        .expect(200);
      expect(approved.body).toMatchObject({
        id,
        status: 'approved',
        approvedAt: NOW,
      });
      const back = await api()
        .patch(`/reports/${id}`)
        .send({ status: 'draft' })
        .expect(200);
      expect(back.body).toMatchObject({ status: 'draft', approvedAt: null });
      await api()
        .patch(`/reports/${id}`)
        .send({ status: 'published' })
        .expect(400);
      await api()
        .patch('/reports/no-such-report')
        .send({ status: 'approved' })
        .expect(404);
    });

    it('approves several reports at once', async () => {
      const ids = ['fenwick-rowe-2026-w41', 'copperleaf-studio-2026-w41'];
      const result = await api()
        .post('/reports/status')
        .send({ ids, status: 'approved' })
        .expect(200);
      expect(
        result.body.data.map((r: { id: string; status: string }) => [
          r.id,
          r.status,
        ]),
      ).toEqual([
        [ids[0], 'approved'],
        [ids[1], 'approved'],
      ]);
      const queue = await api().get('/reports/queue').expect(200);
      expect(queue.body.data).toHaveLength(12);
      await api()
        .post('/reports/status')
        .send({ ids, status: 'draft' })
        .expect(200);
      await api()
        .post('/reports/status')
        .send({ ids: [], status: 'approved' })
        .expect(400);
    });
  });

  describe('sources and connections', () => {
    it('reads sources in the order asked', async () => {
      const sources = await api()
        .get(
          '/sources?ids=src-hd-call-restore-ask,no-such-source,src-hd-alert-48213',
        )
        .expect(200);
      expect(sources.body.data.map((s: { id: string }) => s.id)).toEqual([
        'src-hd-call-restore-ask',
        'src-hd-alert-48213',
      ]);
      await api().get('/sources').expect(400);
    });

    it('lists connectors and the audit log', async () => {
      const connectors = listOf(connectorSchema).parse(
        (await api().get('/connectors').expect(200)).body,
      );
      expect(connectors.data.find((c) => c.tool === 'hudu')?.status).toBe(
        'failing',
      );
      const audit = await api().get('/audit?tool=hudu').expect(200);
      expect(audit.body.data.length).toBeGreaterThan(0);
      expect(
        audit.body.data.every((e: { tool: string }) => e.tool === 'hudu'),
      ).toBe(true);
      await api().get('/audit?tool=jira').expect(400);
    });
  });
});
