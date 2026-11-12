'use server';

export type AskState = { error?: string };

/**
 * Not connected to the API yet. When it is: send `question`, then go to the
 * answer's page (/ask/[id]).
 */
export async function ask(): Promise<AskState> {
  return { error: 'Asking isn’t connected yet.' };
}
