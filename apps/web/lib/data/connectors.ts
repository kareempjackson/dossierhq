import 'server-only';
import {
  connectionTestSchema,
  connectorSchema,
  listOf,
  ninjaOneSignInStartSchema,
  sharePointPlacesSchema,
  type ConnectionTest,
  type Connector,
  type ConnectorCredentials,
  type NinjaOneSignIn,
  type NinjaOneSignInFinish,
  type NinjaOneSignInStart,
  type SharePointBrowse,
  type SharePointPlaces,
  type Tool,
} from '@dossierhq/contracts';
import { cache } from 'react';
import { apiGet, apiSend } from '../api';
import { refused } from './refused';

/**
 * The tools a workspace reads, through the API. Connecting checks the
 * credentials with the tool, keeps them encrypted, and starts a sync; the
 * API never sends them back. Owners and admins connect, change and
 * disconnect; anyone can test a saved connection or sync it.
 */

type Refused = { ok: false; problem: string };

/** Each connected tool, in tool order. Tools not connected aren't listed. */
export const getConnectors = cache(
  async (): Promise<Connector[]> =>
    (await apiGet('/connectors', listOf(connectorSchema))).data,
);

/** Connects a tool, or changes its connection, and starts a sync. */
export async function connectTool(
  credentials: ConnectorCredentials,
): Promise<{ ok: true; connector: Connector } | Refused> {
  try {
    const connector = await apiSend(
      'PUT',
      `/connectors/${credentials.tool}`,
      credentials,
      connectorSchema,
      { timeoutMs: 30_000 },
    );
    return { ok: true, connector };
  } catch (error) {
    return refused(error);
  }
}

/** Checks credentials with the tool without keeping them. */
export async function testCredentials(
  credentials: ConnectorCredentials,
): Promise<ConnectionTest | Refused> {
  try {
    return await apiSend(
      'POST',
      '/connectors/test',
      credentials,
      connectionTestSchema,
      { timeoutMs: 30_000 },
    );
  } catch (error) {
    return refused(error);
  }
}

/**
 * Checks a saved connection still works. It waits behind any sync that's
 * running, so it gets longer than the usual 10 seconds.
 */
export async function testConnection(
  tool: Tool,
): Promise<ConnectionTest | Refused> {
  try {
    return await apiSend(
      'POST',
      `/connectors/${tool}/test`,
      undefined,
      connectionTestSchema,
      { timeoutMs: 60_000 },
    );
  } catch (error) {
    return refused(error);
  }
}

/**
 * SharePoint's sites, or a site's libraries and the folders at one level,
 * for choosing where the client folders are. The app's secret is sent each
 * time and never kept.
 */
export async function browseSharePoint(
  request: SharePointBrowse,
): Promise<SharePointPlaces | Refused> {
  try {
    return await apiSend(
      'POST',
      '/connectors/sharepoint/browse',
      request,
      sharePointPlacesSchema,
      { timeoutMs: 30_000 },
    );
  } catch (error) {
    return refused(error);
  }
}

/** Where to send someone to sign in to NinjaOne, and what to hand back after. */
export async function startNinjaOneSignIn(
  app: NinjaOneSignIn,
): Promise<{ ok: true; start: NinjaOneSignInStart } | Refused> {
  try {
    const start = await apiSend(
      'POST',
      '/connectors/ninjaone/sign-in',
      app,
      ninjaOneSignInStartSchema,
    );
    return { ok: true, start };
  } catch (error) {
    return refused(error);
  }
}

/** Swaps NinjaOne's code for a connection, which starts a sync. */
export async function finishNinjaOneSignIn(
  finish: NinjaOneSignInFinish,
): Promise<{ ok: true; connector: Connector } | Refused> {
  try {
    const connector = await apiSend(
      'POST',
      '/connectors/ninjaone/sign-in/finish',
      finish,
      connectorSchema,
      { timeoutMs: 30_000 },
    );
    return { ok: true, connector };
  } catch (error) {
    return refused(error);
  }
}

/** Starts a sync now; the API answers at once, while it runs. */
export function syncTool(tool: Tool): Promise<Connector> {
  return apiSend(
    'POST',
    `/connectors/${tool}/sync`,
    undefined,
    connectorSchema,
  );
}

/**
 * Disconnects a tool: the API forgets its credentials and everything it
 * read, including clients only that tool knew about.
 */
export function disconnectTool(tool: Tool): Promise<void> {
  return apiSend('DELETE', `/connectors/${tool}`);
}
