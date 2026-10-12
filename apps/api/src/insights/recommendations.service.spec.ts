import { createMemoryAdapter } from '@dossierhq/database/memory';
import { demo } from '@dossierhq/fixtures';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Clock } from '../common/clock.js';
import { DATABASE } from '../database/database.module.js';
import { RecommendationsService } from './recommendations.service.js';

const NOW = '2030-01-01T09:00:00.000Z';
const ws = demo.workspace.id;

describe('RecommendationsService', () => {
  let service: RecommendationsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecommendationsService,
        { provide: DATABASE, useValue: createMemoryAdapter(demo) },
        { provide: Clock, useValue: { now: () => NOW } },
      ],
    }).compile();
    service = moduleRef.get(RecommendationsService);
  });

  it('stamps decidedAt when accepting or dismissing', async () => {
    await expect(
      service.update(ws, 'rec-hd-restore-test', { status: 'dismissed' }),
    ).resolves.toMatchObject({ status: 'dismissed', decidedAt: NOW });
  });

  it('clears decidedAt when moved back to draft', async () => {
    await service.update(ws, 'rec-hd-restore-test', { status: 'accepted' });
    await expect(
      service.update(ws, 'rec-hd-restore-test', { status: 'draft' }),
    ).resolves.toMatchObject({ status: 'draft', decidedAt: null });
  });

  it('leaves decidedAt alone when only the wording changes', async () => {
    await expect(
      service.update(ws, 'rec-hd-restore-test', { title: 'New title' }),
    ).resolves.toMatchObject({ title: 'New title', decidedAt: null });
  });

  it('throws NotFoundException for unknown recommendations', async () => {
    await expect(
      service.update(ws, 'no-such-rec', { status: 'accepted' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
