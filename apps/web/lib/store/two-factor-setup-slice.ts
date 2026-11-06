import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * Turning on two-factor sign-in, one step at a time: what it's for, then
 * the QR code and a code from the app, then the recovery codes. Used by
 * onboarding and by Settings. The secret and the codes live here only while
 * they're on screen: the flow resets when it finishes or unmounts, and
 * nothing in the store is ever persisted.
 */
export type TwoFactorSetupState =
  | { step: 'intro' }
  | { step: 'scan'; secret: string; qr: string }
  | { step: 'codes'; recoveryCodes: string[] }
  | { step: 'done' };

const initialState = { step: 'intro' } as TwoFactorSetupState;

export const twoFactorSetupSlice = createSlice({
  name: 'twoFactorSetup',
  initialState,
  reducers: {
    /** The API made a secret; show its QR code. */
    scanReady(
      _state,
      action: PayloadAction<{ secret: string; qr: string }>,
    ): TwoFactorSetupState {
      return { step: 'scan', ...action.payload };
    },
    /** A code from the app matched: it's on, and these codes show once. */
    enabled(_state, action: PayloadAction<string[]>): TwoFactorSetupState {
      return { step: 'codes', recoveryCodes: action.payload };
    },
    /** The codes are saved somewhere; forget them here. */
    saved(): TwoFactorSetupState {
      return { step: 'done' };
    },
    /** Back to the start, forgetting the secret and the codes. */
    reset(): TwoFactorSetupState {
      return initialState;
    },
  },
  selectors: {
    selectTwoFactorSetup: (state: TwoFactorSetupState) => state,
  },
});

export const { scanReady, enabled, saved, reset } = twoFactorSetupSlice.actions;
export const { selectTwoFactorSetup } = twoFactorSetupSlice.selectors;
