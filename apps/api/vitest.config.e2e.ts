import { defineConfig } from 'vitest/config';
import { HOSTS } from './test/fake-tools.js';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.e2e-spec.ts'],
    // e2e tests boot the real AppModule on the in-memory adapter (each suite
    // supplies its own data) and point the tools at the fakes in
    // test/fake-tools.ts, so they need no database and no accounts.
    // Shell/.env values for these keys are overridden.
    env: {
      NODE_ENV: 'test',
      DATABASE_PROVIDER: 'memory',
      CLOCK_FIXED_AT: '2026-10-09T15:40:00.000Z',
      CONNECTOR_SECRET_KEY: Buffer.alloc(32, 1).toString('base64'),
      SYNC_INTERVAL_MINUTES: '0',
      NINJAONE_API_URL: HOSTS.ninjaone,
      FATHOM_API_URL: HOSTS.fathom,
      MICROSOFT_LOGIN_URL: HOSTS.login,
      MICROSOFT_GRAPH_URL: HOSTS.graph,
    },
  },
});
