import { createMemoryAdapter } from '@dossierhq/database/memory';
import { demo } from '@dossierhq/fixtures';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Clock } from '../common/clock.js';
import { DATABASE } from '../database/database.module.js';
import { ReportsService } from './reports.service.js';

const NOW = '2030-01-01T09:00:00.000Z';
const ws = demo.workspace.id;

describe('ReportsService', () => {
  let service: ReportsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: DATABASE, useValue: createMemoryAdapter(demo) },
        { provide: Clock, useValue: { now: () => NOW } },
      ],
    }).compile();
    service = moduleRef.get(ReportsService);
  });

  it('queues drafts with exceptions before clean ones', async () => {
    const queue = await service.queue(ws);
    const firstClean = queue.findIndex((r) => r.exceptions.length === 0);
    expect(queue).toHaveLength(14);
    expect(firstClean).toBe(4);
    expect(queue.every((r) => r.status === 'draft')).toBe(true);
  });

  it('stamps approvals with the clock and drops them from the queue', async () => {
    const report = await service.setOneStatus(
      ws,
      'harbour-dental-2026-w41',
      'approved',
    );
    expect(report).toMatchObject({ status: 'approved', approvedAt: NOW });
    await expect(service.queue(ws)).resolves.toHaveLength(13);
  });

  it('throws NotFoundException for unknown reports', async () => {
    await expect(
      service.setOneStatus(ws, 'no-such-report', 'approved'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
