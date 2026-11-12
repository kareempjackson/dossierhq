import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AuditCount } from '@dossierhq/contracts';

/**
 * How many entries the audit log holds per tab, by client ('' for every
 * client). Each audit log page reads them on the server and hands them over
 * through <AuditCountsSync>; the tab bar shows them from here, so they stay
 * put while the next tab loads.
 */
export type AuditState = { counts: Record<string, AuditCount[]> };

const initialState: AuditState = { counts: {} };

export const auditSlice = createSlice({
  name: 'audit',
  initialState,
  reducers: {
    auditCountsLoaded(
      state,
      action: PayloadAction<{ client: string; counts: AuditCount[] }>,
    ) {
      state.counts[action.payload.client] = action.payload.counts;
    },
  },
  selectors: {
    /** The counts for one client ('' for every client); null until read. */
    selectAuditCounts: (state: AuditState, client: string) =>
      state.counts[client] ?? null,
  },
});

export const { auditCountsLoaded } = auditSlice.actions;
export const { selectAuditCounts } = auditSlice.selectors;
