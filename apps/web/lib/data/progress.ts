import 'server-only';
import {
  progressSchema,
  type Progress,
  type ProgressWatch,
} from '@dossierhq/contracts';
import { apiGet, withQuery } from '../api';

/** Where work a page is waiting on stands; a few bytes, so it can be asked often. */
export const getProgress = (
  watch: ProgressWatch,
  id?: string,
): Promise<Progress> =>
  apiGet(withQuery('/progress', { watch, id }), progressSchema, {
    // Asked from the browser in the background: no redirect to follow.
    session: 'best-effort',
  });
