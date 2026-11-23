import 'server-only';
import { shellSchema, type Shell } from '@dossierhq/contracts';
import { cache } from 'react';
import { apiGet } from '../api';

/** What the chrome around every page shows, in one request. */
export const getShell = cache((): Promise<Shell> =>
  apiGet('/shell', shellSchema),
);
