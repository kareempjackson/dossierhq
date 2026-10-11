import { createMemoryAdapter } from '@dossierhq/database/memory';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NOTES_REPOSITORY } from '../database/database.tokens.js';
import { NotesService } from './notes.service.js';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('NotesService', () => {
  let service: NotesService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotesService,
        // Any adapter's repository fits here; memory needs no setup.
        { provide: NOTES_REPOSITORY, useValue: createMemoryAdapter().notes },
      ],
    }).compile();

    service = moduleRef.get(NotesService);
  });

  it('creates and reads back a note', async () => {
    const created = await service.create({ title: 'Hello', body: '' });

    await expect(service.get(created.id)).resolves.toEqual(created);
    await expect(service.list({ limit: 10, offset: 0 })).resolves.toEqual([
      created,
    ]);
  });

  it('updates a note', async () => {
    const created = await service.create({ title: 'Before', body: '' });

    await expect(
      service.update(created.id, { title: 'After' }),
    ).resolves.toMatchObject({
      title: 'After',
    });
  });

  it('throws NotFoundException for unknown ids', async () => {
    await expect(service.get(UNKNOWN_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.update(UNKNOWN_ID, { title: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove(UNKNOWN_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
