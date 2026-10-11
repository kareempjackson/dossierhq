import { describeNotesRepositoryContract } from '../../testing/notes-repository.contract.js';
import { createPostgresAdapter } from './index.js';

const { DATABASE_URL } = process.env;

describeNotesRepositoryContract(
  'postgres',
  async () => createPostgresAdapter({ url: DATABASE_URL!, maxConnections: 2 }),
  { skip: !DATABASE_URL },
);
