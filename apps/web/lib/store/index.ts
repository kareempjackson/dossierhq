import { combineSlices, configureStore } from '@reduxjs/toolkit';
import { auditSlice } from './audit-slice';
import { connectionsSlice } from './connections-slice';
import { reportsSlice } from './reports-slice';
import { sessionSlice } from './session-slice';
import { twoFactorSetupSlice } from './two-factor-setup-slice';

/**
 * The browser's state. Server code never touches it: pages read the API on
 * the server and hand what the browser needs to a client component, which
 * dispatches it. Server actions still make every API call and own the
 * cookies.
 */
const rootReducer = combineSlices(
  sessionSlice,
  twoFactorSetupSlice,
  connectionsSlice,
  auditSlice,
  reportsSlice,
);

/**
 * A new store for each browser tab, made once by <StoreProvider>. Never a
 * module-level store: the server renders many people's requests, and one
 * shared store would mix them up.
 */
export function makeStore() {
  return configureStore({ reducer: rootReducer });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = AppStore['dispatch'];
