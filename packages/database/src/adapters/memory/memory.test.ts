import { describeNotesRepositoryContract } from '../../testing/notes-repository.contract.js';
import { createMemoryAdapter } from './index.js';

describeNotesRepositoryContract('memory', async () => createMemoryAdapter());
