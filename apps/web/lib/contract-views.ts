import {
  CONTRACT_DOCUMENT_TYPES,
  type Contract,
  type ContractDocument,
} from '@dossierhq/contracts';
import { RENEWAL_SOON_DAYS, renewsIn } from './client-paths';
import type { When } from './client-views';
import { calendarDay, dayMonth, daysUntil } from './format';

/**
 * A client's contract as its tab shows it, in the workspace's time zone.
 * Pure: the page reads the API and passes the results in.
 */

export type ContractView = {
  plan: string;
  /** "USD 1,250.00 a month". */
  fee: string;
  started: string;
  renews: string;
  /** "in 12 days", "3 days overdue". */
  renewsIn: string;
  /** Renewing within RENEWAL_SOON_DAYS, or overdue. */
  soon: boolean;
  includes: string[];
  /** As typed, for the form to start from. */
  form: {
    plan: string;
    monthlyFee: string;
    currency: string;
    startedOn: string;
    renewsOn: string;
    includes: string;
  };
};

/** "USD 1,250.00"; a code Intl doesn't know is written as it is. */
function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      currencyDisplay: 'code',
    })
      .format(amount)
      .replace(/ /g, ' ');
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function contractView(
  contract: Contract,
  { timeZone, now }: When,
): ContractView {
  const days = daysUntil(contract.renewsOn, timeZone, now);
  return {
    plan: contract.plan,
    fee: `${money(contract.monthlyFee, contract.currency)} a month`,
    started: calendarDay(contract.startedOn, timeZone, now),
    renews: calendarDay(contract.renewsOn, timeZone, now),
    renewsIn: renewsIn(days),
    soon: days <= RENEWAL_SOON_DAYS,
    includes: contract.includes,
    form: {
      plan: contract.plan,
      monthlyFee: String(contract.monthlyFee),
      currency: contract.currency,
      startedOn: contract.startedOn,
      renewsOn: contract.renewsOn,
      includes: contract.includes.join('\n'),
    },
  };
}

export type DocumentRow = {
  id: string;
  name: string;
  /** "PDF · 240 KB". */
  about: string;
  /** "Added by Rae Kim, 3 Nov". */
  added: string;
  /** Where the browser opens it: this app's route, which asks the API. */
  href: string;
};

/** "240 KB", "1.4 MB". */
function size(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function documentRows(
  documents: ContractDocument[],
  { timeZone, now }: When,
): DocumentRow[] {
  return documents.map((document) => ({
    id: document.id,
    name: document.name,
    about: `${CONTRACT_DOCUMENT_TYPES[document.contentType]} · ${size(document.size)}`,
    added: `Added by ${document.uploadedBy.name}, ${dayMonth(document.uploadedAt, timeZone, now)}`,
    href: contractFileHref(document.clientId, document.id),
  }));
}

export const contractFileHref = (clientId: string, documentId: string) =>
  `/clients/${encodeURIComponent(clientId)}/contract/files/${encodeURIComponent(documentId)}`;
