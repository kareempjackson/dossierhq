'use server';

import {
  CONTRACT_DOCUMENT_MAX_BYTES,
  contractDocumentTypeSchema,
  contractUpdateSchema,
  recipientsUpdateSchema,
  recommendationUpdateSchema,
  type Recipient,
} from '@dossierhq/contracts';
import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import * as data from '@/lib/data/client-records';
import { recordClientView } from '@/lib/data/clients';
import * as contracts from '@/lib/data/contracts';

/**
 * Changes made from a client's file: deciding on Dossier's drafts, who gets
 * the weekly report, and the contract. Each checks what it's given with the API's own
 * schema, asks the API, and words its no; the page then reads again.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const unavailable =
  'Dossier can’t reach its server right now. Try again shortly.';

async function attempt(
  run: () => Promise<{ ok: true } | { ok: false; problem: string }>,
): Promise<ActionResult> {
  try {
    const result = await run();
    if (!result.ok) return { ok: false, error: result.problem };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: unavailable };
  }
  refresh();
  return { ok: true };
}

/** Accepts or dismisses a draft, or puts it back to draft. */
export async function decideRecommendation(
  id: string,
  status: 'accepted' | 'dismissed' | 'draft',
): Promise<ActionResult> {
  const update = recommendationUpdateSchema.safeParse({ status });
  if (!update.success) return { ok: false, error: 'That isn’t a decision.' };
  return attempt(() => data.updateRecommendation(id, update.data));
}

/** Rewords a draft's title. */
export async function rewordRecommendation(
  id: string,
  title: string,
): Promise<ActionResult> {
  const update = recommendationUpdateSchema.safeParse({ title });
  if (!update.success) {
    return {
      ok: false,
      error: update.error.issues[0]?.message ?? 'Check the wording.',
    };
  }
  return attempt(() => data.updateRecommendation(id, update.data));
}

/** Replaces who the client's weekly report goes to. */
export async function saveRecipients(
  clientId: string,
  recipients: Recipient[],
): Promise<ActionResult> {
  const update = recipientsUpdateSchema.safeParse({ recipients });
  if (!update.success) {
    return {
      ok: false,
      error: update.error.issues[0]?.message ?? 'Check the addresses.',
    };
  }
  return attempt(() => data.saveRecipients(clientId, update.data.recipients));
}

// Contract ----------------------------------------------------------------------

export type ContractFormState = {
  error?: string;
  /** Which field the error is about; none for the whole form. */
  field?: 'plan' | 'monthlyFee' | 'currency' | 'startedOn' | 'renewsOn' | 'includes';
  saved?: number;
};

const CONTRACT_FIELDS = new Set([
  'plan',
  'monthlyFee',
  'currency',
  'startedOn',
  'renewsOn',
  'includes',
]);

/** Sets the contract's terms from its form; the client's id comes with it. */
export async function saveContract(
  _previous: ContractFormState,
  formData: FormData,
): Promise<ContractFormState> {
  const clientId = String(formData.get('clientId') ?? '');
  const fee = String(formData.get('monthlyFee') ?? '')
    .replace(/[,\s]/g, '')
    .trim();
  const parsed = contractUpdateSchema.safeParse({
    plan: formData.get('plan') ?? '',
    startedOn: formData.get('startedOn') ?? '',
    renewsOn: formData.get('renewsOn') ?? '',
    // Blank or not a number is "Enter the monthly fee", not a zero.
    monthlyFee: fee === '' ? undefined : Number(fee),
    currency: formData.get('currency') ?? '',
    includes: String(formData.get('includes') ?? '')
      .split('\n')
      .map((line) => line.replace(/^[\s•*-]+/, '').trim())
      .filter(Boolean),
  });
  if (!clientId) return { error: 'This client has gone.' };
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    return {
      error: issue?.message ?? 'Check the contract’s terms.',
      field:
        typeof field === 'string' && CONTRACT_FIELDS.has(field)
          ? (field as ContractFormState['field'])
          : undefined,
    };
  }
  const result = await attempt(() => contracts.saveContract(clientId, parsed.data));
  return result.ok ? { saved: Date.now() } : { error: result.error };
}

/** Takes the contract's terms away; its files stay. */
export async function removeContract(clientId: string): Promise<ActionResult> {
  if (!clientId) return { ok: false, error: 'This client has gone.' };
  return attempt(() => contracts.removeContract(clientId));
}

export type ContractFileState = { error?: string; added?: string };

/** Keeps a file with the contract. Checked here first, then by the API. */
export async function addContractFile(
  _previous: ContractFileState,
  formData: FormData,
): Promise<ContractFileState> {
  const clientId = String(formData.get('clientId') ?? '');
  const file = formData.get('file');
  if (!clientId) return { error: 'This client has gone.' };
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a file to add.' };
  }
  const type = contractDocumentTypeSchema.safeParse(file.type);
  if (!type.success) {
    return { error: 'Add a PDF, Word document, PNG or JPEG.' };
  }
  if (file.size > CONTRACT_DOCUMENT_MAX_BYTES) {
    return { error: 'Keep each file under 10 MB.' };
  }
  const result = await attempt(async () =>
    contracts.addContractDocument(clientId, {
      name: file.name,
      type: type.data,
      bytes: new Uint8Array(await file.arrayBuffer()),
    }),
  );
  return result.ok ? { added: file.name } : { error: result.error };
}

/** Removes a file from the contract. */
export async function removeContractFile(
  clientId: string,
  documentId: string,
): Promise<ActionResult> {
  if (!clientId || !documentId) {
    return { ok: false, error: 'That file has already gone.' };
  }
  return attempt(() => contracts.removeContractDocument(clientId, documentId));
}

/**
 * Notes that the client's file was opened, so it leads "Your clients" on
 * Today. Nothing on screen depends on it: a failure is let go.
 */
export async function recordView(clientId: string): Promise<void> {
  if (!clientId) return;
  try {
    await recordClientView(clientId);
  } catch (error) {
    unstable_rethrow(error);
  }
}
