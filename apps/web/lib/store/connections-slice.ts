import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Tool } from '@dossierhq/contracts';
import type { ToolStatus } from '@/lib/connector-status';

/**
 * The workspace's tools as the Connections pages show them. Loaded once by
 * the Connections layout and kept, so moving between the list and a tool
 * draws at once; each refresh (after an action, or while a sync runs)
 * replaces it in place. Until the first load, `status` is `unknown` and the
 * pages show placeholders; if the API can't be reached it's `error`.
 */
export type ConnectionsData = {
  tools: ToolStatus[];
  /** Owners and admins connect, change and disconnect. */
  canManage: boolean;
  /** Reads from each tool in the last 90 days, where known. */
  recentReads: Partial<Record<Tool, number>>;
  /** Where NinjaOne sends people back, on the address in use. */
  redirectUri: string;
  /** Why the last NinjaOne sign-in didn't work; shown once. */
  signInProblem: string | null;
};

export type ConnectionsState =
  | { status: 'unknown' }
  | { status: 'error' }
  | ({ status: 'ready' } & ConnectionsData);

const initialState = { status: 'unknown' } as ConnectionsState;

export const connectionsSlice = createSlice({
  name: 'connections',
  initialState,
  reducers: {
    connectionsLoaded(
      _state,
      action: PayloadAction<ConnectionsData>,
    ): ConnectionsState {
      return { status: 'ready', ...action.payload };
    },
    /** Keeps what was there before, if anything: better stale than blank. */
    connectionsFailed(state): ConnectionsState {
      return state.status === 'ready' ? state : { status: 'error' };
    },
  },
  selectors: {
    selectConnections: (state: ConnectionsState) => state,
  },
});

export const { connectionsLoaded, connectionsFailed } =
  connectionsSlice.actions;
export const { selectConnections } = connectionsSlice.selectors;
