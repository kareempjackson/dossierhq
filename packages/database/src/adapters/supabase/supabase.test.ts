import { describeDatabaseContract } from '../../testing/database.contract.js';
import { createSupabaseAdapter } from './index.js';

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;

describeDatabaseContract(
  'supabase',
  async () =>
    createSupabaseAdapter({
      url: SUPABASE_URL!,
      secretKey: SUPABASE_SECRET_KEY!,
    }),
  { skip: !SUPABASE_URL || !SUPABASE_SECRET_KEY },
);
