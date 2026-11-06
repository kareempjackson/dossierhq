'use server';

export type UpdatesState = { message?: string };

/** Not connected yet: adding an address to the product-updates list. */
export async function subscribeToUpdates(): Promise<UpdatesState> {
  return { message: 'Product updates aren’t connected yet.' };
}
