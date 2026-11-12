import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ReportsData } from '@/lib/report-views';

/**
 * What every Reports tab shows above the sheet: the week, when approved
 * reports go, the drafts to review and the tabs' counts. Loaded by the
 * Reports layout and replaced in place on each refresh, so the tabs and the
 * review list stay put while a tab's content changes. Until the first load
 * `status` is `unknown`, and the counts don't show.
 */
export type ReportsState =
  | { status: 'unknown' }
  | { status: 'error' }
  | ({ status: 'ready' } & ReportsData);

const initialState = { status: 'unknown' } as ReportsState;

export const reportsSlice = createSlice({
  name: 'reports',
  initialState,
  reducers: {
    reportsLoaded(_state, action: PayloadAction<ReportsData>): ReportsState {
      return { status: 'ready', ...action.payload };
    },
    /** Keeps what was there before, if anything: better stale than blank. */
    reportsFailed(state): ReportsState {
      return state.status === 'ready' ? state : { status: 'error' };
    },
  },
  selectors: {
    selectReports: (state: ReportsState) => state,
  },
});

export const { reportsLoaded, reportsFailed } = reportsSlice.actions;
export const { selectReports } = reportsSlice.selectors;
