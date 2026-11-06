const TITLE = /^(?:dr|mr|mrs|ms|miss|mx|prof)\.?\s+/i;

/**
 * Who a spelling of a name is: lower-case letters and digits, without a
 * title, a note in brackets, or an email's domain. "Dr Helen Okoro",
 * `helen.okoro@…` and `HelenOkoro` are all `helenokoro`. Null when nothing
 * is left.
 */
export function personKey(spelling: string): string | null {
  const key = (spelling.trim().split('@')[0] ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .trim()
    .replace(TITLE, '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
  return key || null;
}
