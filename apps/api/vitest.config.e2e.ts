import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.e2e-spec.ts'],
    // e2e tests boot the real AppModule on the in-memory adapter seeded with
    // the demo workspace, with the clock pinned, so they need no database.
    // Shell/.env values for these keys are overridden.
    env: {
      NODE_ENV: 'test',
      DATABASE_PROVIDER: 'memory',
      DATABASE_SEED: 'demo',
      CLOCK_FIXED_AT: '2026-10-09T15:40:00.000Z',
    },
  },
});
