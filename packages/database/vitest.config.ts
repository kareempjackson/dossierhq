import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vitest/config';

function readEnvFile(name: string): Record<string, string> {
  const file = new URL(name, import.meta.url);
  return existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
}

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    // Integration suites share one database; run files one at a time.
    fileParallelism: false,
    // Integration suites read SUPABASE_* / DATABASE_* from .env files in this
    // package (see .env.example) and skip themselves when they are not set.
    // Variables already set in the shell win over the files.
    env: {
      ...readEnvFile('.env'),
      ...readEnvFile('.env.local'),
      ...process.env,
    },
  },
});
