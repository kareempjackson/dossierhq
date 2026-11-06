'use server';

export type AskState = { error?: string };

/**
 * Not connected to the API yet. When it is: send `question`, then go to the
 * answer's page (/ask/[id]).
 */
export async function ask(): Promise<AskState> {
  return { error: 'Asking isn’t connected yet.' };
}

export type FormState = { error?: string };

/** Not connected to the API yet: drafting every client's report now. */
export async function draftReportsNow(): Promise<FormState> {
  return { error: 'Drafting isn’t connected yet.' };
}

/** Not connected to the API yet: saving how reports look and when they go. */
export async function saveDelivery(): Promise<FormState> {
  return { error: 'Saving delivery settings isn’t connected yet.' };
}

/** Not connected to the API yet: drafting recommendations for every client now. */
export async function draftRecommendationsNow(): Promise<FormState> {
  return { error: 'Drafting isn’t connected yet.' };
}

/** Not connected to the API yet: looking for the same problem across clients. */
export async function lookForPatterns(): Promise<FormState> {
  return { error: 'Looking for patterns isn’t connected yet.' };
}

/** Not connected to the API yet: checking a provider's API key and keeping it. */
export async function saveApiKey(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return {
    error: `Checking keys with ${String(formData.get('provider') ?? 'the provider')} isn’t connected yet.`,
  };
}
