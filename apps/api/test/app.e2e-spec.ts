import { noteSchema, type Note } from '@dossierhq/contracts';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

// vitest.config.e2e.ts sets DATABASE_PROVIDER=memory, so this boots the real
// AppModule end to end without a database.
describe('API (e2e)', () => {
  let app: INestApplication;

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

  it('GET /health reports the active adapter', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok', database: { provider: 'memory', status: 'up' } });
  });

  it('creates, reads, updates and deletes a note', async () => {
    const server = app.getHttpServer();

    const created = await request(server)
      .post('/notes')
      .send({ title: '  First note  ' })
      .expect(201);
    const note: Note = noteSchema.parse(created.body);
    expect(note).toMatchObject({ title: 'First note', body: '' });

    await request(server)
      .get(`/notes/${note.id}`)
      .expect(200)
      .expect(created.body);

    const list = await request(server).get('/notes').expect(200);
    expect(list.body.data.map((n: Note) => n.id)).toContain(note.id);

    const updated = await request(server)
      .patch(`/notes/${note.id}`)
      .send({ body: 'Edited' })
      .expect(200);
    expect(updated.body).toMatchObject({
      id: note.id,
      title: 'First note',
      body: 'Edited',
    });

    await request(server).delete(`/notes/${note.id}`).expect(204);
    await request(server).get(`/notes/${note.id}`).expect(404);
  });

  it('rejects invalid input with field errors', async () => {
    const res = await request(app.getHttpServer())
      .post('/notes')
      .send({ title: '' })
      .expect(400);

    expect(res.body.errors).toEqual([
      { path: 'title', message: 'Title is required' },
    ]);
  });

  it('rejects an empty update', async () => {
    const created = await request(app.getHttpServer())
      .post('/notes')
      .send({ title: 'x' });

    await request(app.getHttpServer())
      .patch(`/notes/${created.body.id}`)
      .send({})
      .expect(400);
  });

  it('rejects malformed ids and pagination', async () => {
    await request(app.getHttpServer()).get('/notes/not-a-uuid').expect(400);
    await request(app.getHttpServer()).get('/notes?limit=0').expect(400);
  });
});
