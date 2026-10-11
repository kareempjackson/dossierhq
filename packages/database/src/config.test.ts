import { databaseConfigFromEnv } from './config.js';
import { DatabaseConfigError } from './errors.js';

describe('databaseConfigFromEnv', () => {
  it('defaults to supabase', () => {
    expect(
      databaseConfigFromEnv({
        SUPABASE_URL: 'http://127.0.0.1:55321',
        SUPABASE_SECRET_KEY: 'sb_secret_test',
      }),
    ).toEqual({
      provider: 'supabase',
      url: 'http://127.0.0.1:55321',
      secretKey: 'sb_secret_test',
    });
  });

  it('reads postgres settings', () => {
    expect(
      databaseConfigFromEnv({
        DATABASE_PROVIDER: 'postgres',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
        DATABASE_POOL_MAX: '5',
        DATABASE_PREPARED_STATEMENTS: 'false',
      }),
    ).toEqual({
      provider: 'postgres',
      url: 'postgresql://postgres:postgres@localhost:5432/postgres',
      maxConnections: 5,
      preparedStatements: false,
    });
  });

  it('needs nothing for memory', () => {
    expect(databaseConfigFromEnv({ DATABASE_PROVIDER: 'memory' })).toEqual({
      provider: 'memory',
    });
  });

  it('names the missing variables', () => {
    expect(() =>
      databaseConfigFromEnv({ DATABASE_PROVIDER: 'postgres' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('rejects unknown providers', () => {
    expect(() =>
      databaseConfigFromEnv({ DATABASE_PROVIDER: 'oracle' }),
    ).toThrow(DatabaseConfigError);
  });
});
