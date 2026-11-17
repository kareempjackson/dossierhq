import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * What every workspace page's chrome needs from the API: how many
 * notifications are unread (the bell's badge and the Unread tab), and the
 * clients and reports the command palette jumps to. The workspace layout
 * reads them inside Suspense and hands them over (UnreadSync, PaletteSync);
 * each refresh replaces them in place.
 */

export type PaletteClient = {
  id: string;
  name: string;
  /** The line beside the name, e.g. "3 need attention". */
  summary: string;
  needsYou: boolean;
};

export type PaletteReport = { id: string; clientName: string; week: string };

export type ShellState = {
  /** Null until the API says. */
  unread: number | null;
  /**
   * Notifications marked read in this tab, until the API's next count
   * includes them: the IDs, or every one.
   */
  markedRead: string[] | 'all';
  palette: { clients: PaletteClient[]; reports: PaletteReport[] };
};

const initialState: ShellState = {
  unread: null,
  markedRead: [],
  palette: { clients: [], reports: [] },
};

export const shellSlice = createSlice({
  name: 'shell',
  initialState,
  reducers: {
    /** The API's count: what was marked read here is in it now. */
    unreadLoaded(state, action: PayloadAction<number>) {
      state.unread = action.payload;
      state.markedRead = [];
    },
    /** Marked read here, ahead of the API's answer. Pass only unread ones. */
    notificationsMarkedRead(state, action: PayloadAction<string[] | 'all'>) {
      if (action.payload === 'all') {
        state.markedRead = 'all';
        state.unread = 0;
        return;
      }
      if (state.markedRead === 'all') return;
      const fresh = action.payload.filter(
        (id) => !(state.markedRead as string[]).includes(id),
      );
      state.markedRead.push(...fresh);
      if (state.unread !== null) {
        state.unread = Math.max(0, state.unread - fresh.length);
      }
    },
    paletteLoaded(state, action: PayloadAction<ShellState['palette']>) {
      state.palette = action.payload;
    },
  },
  selectors: {
    selectUnread: (state) => state.unread,
    selectMarkedRead: (state) => state.markedRead,
    selectPalette: (state) => state.palette,
  },
});

export const { unreadLoaded, notificationsMarkedRead, paletteLoaded } =
  shellSlice.actions;
export const { selectUnread, selectMarkedRead, selectPalette } =
  shellSlice.selectors;
