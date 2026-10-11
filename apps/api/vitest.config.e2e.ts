import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.e2e-spec.ts'],
    // e2e tests boot the real AppModule on the in-memory adapter, so they need
    // no running database. Shell/.env values for these keys are overridden.
    env: { NODE_ENV: 'test', DATABASE_PROVIDER: 'memory' },
  },
});
