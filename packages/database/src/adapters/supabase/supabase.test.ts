import { describeNotesRepositoryContract } from '../../testing/notes-repository.contract.js';
import { createSupabaseAdapter } from './index.js';

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;

describeNotesRepositoryContract(
  'supabase',
  async () =>
    createSupabaseAdapter({
      url: SUPABASE_URL!,
      secretKey: SUPABASE_SECRET_KEY!,
    }),
  { skip: !SUPABASE_URL || !SUPABASE_SECRET_KEY },
);
