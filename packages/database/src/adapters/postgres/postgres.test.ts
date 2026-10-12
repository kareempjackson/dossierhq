import { describeDatabaseContract } from '../../testing/database.contract.js';
import { createPostgresAdapter } from './index.js';

const { DATABASE_URL } = process.env;

describeDatabaseContract(
  'postgres',
  async () => createPostgresAdapter({ url: DATABASE_URL!, maxConnections: 2 }),
  { skip: !DATABASE_URL },
);
