'use server';

import {
  connectorCredentialsSchema,
  ninjaOneSignInSchema,
  toolSchema,
  type ConnectionTest,
  type Tool,
} from '@dossierhq/contracts';
import { refresh } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import type { ZodError } from 'zod';
import * as data from '@/lib/data';
import {
  forgetProblem,
  keepPending,
  ninjaOneRedirectUri,
} from '@/lib/ninjaone-sign-in';
import type { ActionResult } from './actions';

/** Fields each tool's form sends; secrets are never echoed back. */
const FIELDS: Record<Tool, { name: string; secret?: boolean }[]> = {
  ninjaone: [
    { name: 'region' },
    { name: 'clientId' },
    { name: 'clientSecret', secret: true },
  ],
  hudu: [{ name: 'url' }, { name: 'apiKey', secret: true }],
  sharepoint: [
    { name: 'tenantId' },
    { name: 'clientId' },
    { name: 'clientSecret', secret: true },
    { name: 'siteUrl' },
    { name: 'library' },
    { name: 'folder' },
  ],
  fathom: [{ name: 'apiKey', secret: true }],
};

/** What testing a connection found; `field` is the one a form error is about. */
export type TestState =
  { ok: true; account: string } | { ok: false; error: string; field?: string };

export type ConnectState = {
  ok?: boolean;
  error?: string;
  /** The field the error is about. */
  field?: string;
  values?: Record<string, string>;
};

const unavailable =
  'Dossier can’t reach its server right now. Try again shortly.';

/**
 * Connects a tool, or replaces its credentials. The API tries them with the
 * tool before saving, so a refusal comes back here in the tool's own terms.
 */
export async function connectTool(
  _previous: ConnectState,
  formData: FormData,
): Promise<ConnectState> {
  const tool = toolSchema.safeParse(formData.get('tool'));
  if (!tool.success) return { error: 'That isn’t a tool Dossier knows.' };

  const { raw, values } = readForm(tool.data, formData);
  if (tool.data === 'ninjaone' && formData.get('mode') === 'sign-in') {
    return signInToNinjaOne(raw, values);
  }
  const parsed = connectorCredentialsSchema.safeParse({
    tool: tool.data,
    ...raw,
  });
  if (!parsed.success) return { ...firstIssue(parsed.error), values };

  try {
    const result = await data.connectTool(parsed.data);
    if (!result.ok) return { error: result.problem, values };
  } catch (error) {
    unstable_rethrow(error);
    return { error: unavailable, values };
  }
  refresh();
  return { ok: true };
}

/**
 * Tries what's in a connect form with the tool, saving nothing. Called
 * directly, not as the form's action, so the form keeps what was typed.
 */
export async function testCredentials(formData: FormData): Promise<TestState> {
  const tool = toolSchema.safeParse(formData.get('tool'));
  if (!tool.success) {
    return { ok: false, error: 'That isn’t a tool Dossier knows.' };
  }
  const parsed = connectorCredentialsSchema.safeParse({
    tool: tool.data,
    ...readForm(tool.data, formData).raw,
  });
  if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };
  return tested(() => data.testCredentials(parsed.data));
}

/** Tries the saved credentials with the tool, saving nothing. */
export async function testConnection(tool: Tool): Promise<TestState> {
  const parsed = toolSchema.safeParse(tool);
  if (!parsed.success) {
    return { ok: false, error: 'That isn’t a tool Dossier knows.' };
  }
  return tested(() => data.testConnection(parsed.data));
}

async function tested(test: () => Promise<ConnectionTest>): Promise<TestState> {
  try {
    const result = await test();
    return result.ok
      ? { ok: true, account: result.account }
      : { ok: false, error: result.problem };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: unavailable };
  }
}

/** A tool's fields from its form: all of them, and the ones safe to echo back. */
function readForm(tool: Tool, formData: FormData) {
  const fields = FIELDS[tool];
  const raw = Object.fromEntries(
    fields.map(({ name }) => [name, String(formData.get(name) ?? '')]),
  );
  const values = Object.fromEntries(
    fields.filter((f) => !f.secret).map(({ name }) => [name, raw[name]!]),
  );
  return { raw, values };
}

function firstIssue(error: ZodError): { error: string; field: string } {
  const issue = error.issues[0];
  return {
    error: issue?.message ?? 'Check what you entered.',
    field: String(issue?.path[0] ?? ''),
  };
}

/**
 * Sends the person to NinjaOne to sign in, which tickets need. The API seals
 * the app's details; a cookie holds them until NinjaOne sends them back.
 */
async function signInToNinjaOne(
  raw: Record<string, string>,
  values: Record<string, string>,
): Promise<ConnectState> {
  // An app NinjaOne gave no secret signs in with PKCE instead.
  const parsed = ninjaOneSignInSchema.safeParse({
    ...raw,
    clientSecret: raw.clientSecret || undefined,
    redirectUri: await ninjaOneRedirectUri(),
  });
  if (!parsed.success) return { ...firstIssue(parsed.error), values };

  let authorizeUrl: string;
  try {
    const result = await data.startNinjaOneSignIn(parsed.data);
    if (!result.ok) return { error: result.problem, values };
    await keepPending(result.start.pending);
    authorizeUrl = result.start.authorizeUrl;
  } catch (error) {
    unstable_rethrow(error);
    return { error: unavailable, values };
  }
  redirect(authorizeUrl);
}

/** Forgets the last sign-in problem once the page has shown it. */
export async function forgetSignInProblem(): Promise<void> {
  await forgetProblem();
}

export async function syncTool(tool: Tool): Promise<ActionResult> {
  const parsed = toolSchema.safeParse(tool);
  if (!parsed.success)
    return { ok: false, error: 'That isn’t a tool Dossier knows.' };
  try {
    await data.syncTool(parsed.data);
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: 'Couldn’t start a sync. Try again shortly.' };
  }
  refresh();
  return { ok: true };
}

export async function disconnectTool(tool: Tool): Promise<ActionResult> {
  const parsed = toolSchema.safeParse(tool);
  if (!parsed.success)
    return { ok: false, error: 'That isn’t a tool Dossier knows.' };
  try {
    await data.disconnectTool(parsed.data);
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: 'Couldn’t disconnect it. Try again shortly.' };
  }
  refresh();
  return { ok: true };
}

/** Re-reads the page, e.g. while a sync is running. */
export async function refreshPage(): Promise<void> {
  refresh();
}
