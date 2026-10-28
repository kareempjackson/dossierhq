import { describeDatabaseContract } from '../../testing/database.contract.js';
import { loadDemoWorkspace } from '../../testing/load-demo.js';
import { createPostgresAdapter } from './index.js';

const { DATABASE_URL, DATABASE_APP_URL } = process.env;

describeDatabaseContract(
  'postgres',
  async () => createPostgresAdapter({ url: DATABASE_URL!, maxConnections: 2 }),
  { skip: !DATABASE_URL, prepare: () => loadDemoWorkspace(DATABASE_URL!) },
);

// The same contract, connected as dossier_app, which row level security
// applies to: proves every query works when the database enforces tenants.
// The demo workspace is loaded as the owner, as migrations are.
describeDatabaseContract(
  'postgres as dossier_app',
  async () =>
    createPostgresAdapter({ url: DATABASE_APP_URL!, maxConnections: 2 }),
  {
    skip: !DATABASE_URL || !DATABASE_APP_URL,
    prepare: () => loadDemoWorkspace(DATABASE_URL!),
  },
);
