import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SessionMe } from '@/lib/session-me';

/**
 * Who's signed in. The server reads the session (inside Suspense) and hands
 * it over through <SessionSync>; until then the status is `unknown` and
 * screens show a placeholder. Signing out clears it.
 */
export type SessionState = {
  status: 'unknown' | 'signed-in';
  me: SessionMe | null;
};

const initialState: SessionState = { status: 'unknown', me: null };

export const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    sessionLoaded(_state, action: PayloadAction<SessionMe>) {
      return { status: 'signed-in', me: action.payload };
    },
    sessionCleared() {
      return initialState;
    },
  },
  selectors: {
    selectSessionStatus: (state) => state.status,
    selectMe: (state) => state.me,
    selectUser: (state) => state.me?.user ?? null,
    selectRole: (state) => state.me?.role ?? null,
    selectWorkspaceName: (state) => state.me?.workspace.name ?? null,
    /** "Rae Kim" → "Rae"; null until the session is known. */
    selectFirstName: (state) =>
      state.me ? (state.me.user.name.trim().split(/\s+/)[0] ?? null) : null,
  },
});

export const { sessionLoaded, sessionCleared } = sessionSlice.actions;
export const {
  selectSessionStatus,
  selectMe,
  selectUser,
  selectRole,
  selectWorkspaceName,
  selectFirstName,
} = sessionSlice.selectors;
