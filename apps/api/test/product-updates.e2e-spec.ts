import type { DatabaseAdapter } from '@dossierhq/database';
import { createMemoryAdapter } from '@dossierhq/database/memory';
import { demo } from '@dossierhq/fixtures';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DATABASE } from '../src/database/database.module.js';
import { E2E_CLIENT_IP_KEY } from './fake-tools.js';

// The public site's product-updates sign-up, over HTTP on the in-memory
// adapter (see vitest.config.e2e.ts).
describe('Product updates (e2e)', () => {
  let app: INestApplication;
  const api = () => request(app.getHttpServer());
  const db = () => app.get<DatabaseAdapter>(DATABASE);
  /** Headers the web app signs to say where a visitor's request came from. */
  const from = (ip: string) => ({
    'x-dossier-client-ip': ip,
    'x-dossier-client-ip-key': E2E_CLIENT_IP_KEY,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(createMemoryAdapter(demo))
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('adds an address without a session, lowercased, with its page', async () => {
    await api()
      .post('/product-updates')
      .set(from('198.51.100.1'))
      .send({ email: '  Ama.Mensah@Northgate.example ', source: '/welcome' })
      .expect(204)
      .expect('');
    await expect(
      db().productUpdates.find('ama.mensah@northgate.example'),
    ).resolves.toMatchObject({
      email: 'ama.mensah@northgate.example',
      source: '/welcome',
    });
  });

  it('answers a repeat the same, and keeps the first sign-up', async () => {
    await api()
      .post('/product-updates')
      .set(from('198.51.100.1'))
      .send({ email: 'AMA.MENSAH@northgate.example', source: '/privacy' })
      .expect(204)
      .expect('');
    await expect(
      db().productUpdates.find('ama.mensah@northgate.example'),
    ).resolves.toMatchObject({ source: '/welcome' });
  });

  it('takes an address with no page', async () => {
    await api()
      .post('/product-updates')
      .set(from('198.51.100.2'))
      .send({ email: 'kofi@harbour.example' })
      .expect(204);
    await expect(
      db().productUpdates.find('kofi@harbour.example'),
    ).resolves.toMatchObject({ source: null });
  });

  it('turns down an address that isn’t one, and a page that isn’t one', async () => {
    const bad = await api()
      .post('/product-updates')
      .set(from('198.51.100.3'))
      .send({ email: 'not an email' })
      .expect(400);
    expect(JSON.stringify(bad.body)).toContain('Enter a valid email address');
    await api()
      .post('/product-updates')
      .set(from('198.51.100.3'))
      .send({ email: 'sarah@kiln.example', source: 'https://evil.example' })
      .expect(400);
    await expect(
      db().productUpdates.find('sarah@kiln.example'),
    ).resolves.toBeNull();
  });

  it('stops one network after ten in an hour, but not others', async () => {
    for (let n = 0; n < 10; n++) {
      await api()
        .post('/product-updates')
        .set(from('203.0.113.77'))
        .send({ email: `visitor-${n}@flood.example` })
        .expect(204);
    }
    const blocked = await api()
      .post('/product-updates')
      .set(from('203.0.113.77'))
      .send({ email: 'visitor-10@flood.example' })
      .expect(429);
    expect(JSON.stringify(blocked.body)).toContain('Try again in an hour');
    await expect(
      db().productUpdates.find('visitor-10@flood.example'),
    ).resolves.toBeNull();
    await api()
      .post('/product-updates')
      .set(from('203.0.113.78'))
      .send({ email: 'visitor-10@flood.example' })
      .expect(204);
  });

  it('stops one email after five in an hour, from anywhere', async () => {
    for (let n = 0; n < 5; n++) {
      await api()
        .post('/product-updates')
        .set(from(`192.0.2.${n + 1}`))
        .send({ email: 'again@repeat.example' })
        .expect(204);
    }
    await api()
      .post('/product-updates')
      .set(from('192.0.2.99'))
      .send({ email: 'again@repeat.example' })
      .expect(429);
  });
});
