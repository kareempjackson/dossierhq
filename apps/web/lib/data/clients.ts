import 'server-only';
import {
  clientListItemSchema,
  clientSchema,
  listOf,
  type Client,
  type ClientListItem,
} from '@dossierhq/contracts';
import { cache } from 'react';
import { ApiError, apiGet } from '../api';

/**
 * A workspace's clients, through the API. Clients come from the tools:
 * NinjaOne organizations and Hudu companies become clients, and matching
 * names join them up.
 */

/** Every client's name by its id, for showing ids the API returns. */
export const getClientNames = cache(
  async (): Promise<Map<string, string>> =>
    new Map(
      (await apiGet('/clients', listOf(clientSchema))).data.map((client) => [
        client.id,
        client.name,
      ]),
    ),
);

/** Every client with what's current there, most urgent first. */
export const getClientList = cache(
  async (): Promise<ClientListItem[]> =>
    (await apiGet('/clients/overview', listOf(clientListItemSchema))).data,
);

/** One client; null when the workspace has no client with that id. */
export const getClient = cache(async (id: string): Promise<Client | null> => {
  try {
    return await apiGet(`/clients/${encodeURIComponent(id)}`, clientSchema);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
});
