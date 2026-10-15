import { describeDatabaseContract } from '../../testing/database.contract.js';
import { loadDemoWorkspace } from '../../testing/load-demo.js';
import { createSupabaseAdapter } from './index.js';

// DATABASE_URL loads the demo workspace directly; the suite then reads and
// writes it through the Data API.
const { SUPABASE_URL, SUPABASE_SECRET_KEY, DATABASE_URL } = process.env;

describeDatabaseContract(
  'supabase',
  async () =>
    createSupabaseAdapter({
      url: SUPABASE_URL!,
      secretKey: SUPABASE_SECRET_KEY!,
    }),
  {
    skip: !SUPABASE_URL || !SUPABASE_SECRET_KEY || !DATABASE_URL,
    prepare: () => loadDemoWorkspace(DATABASE_URL!),
  },
);
