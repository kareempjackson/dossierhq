import {
  CONTRACT_DOCUMENT_TYPES,
  type ContractDocumentType,
} from '@dossierhq/contracts';

const startsWith = (bytes: Uint8Array, prefix: number[]) =>
  prefix.every((byte, index) => bytes[index] === byte);

/** How each kind of file begins, so a renamed file is caught. */
const SIGNATURES: Record<ContractDocumentType, number[]> = {
  // %PDF-
  'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d],
  // A .docx is a zip.
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    0x50, 0x4b, 0x03, 0x04,
  ],
  // A .doc is an OLE compound file.
  'application/msword': [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/jpeg': [0xff, 0xd8, 0xff],
};

export const isDocumentType = (
  type: string | undefined,
): type is ContractDocumentType =>
  Object.hasOwn(CONTRACT_DOCUMENT_TYPES, type ?? '');

/** True when the file's first bytes are what its type says. */
export const looksLike = (type: ContractDocumentType, bytes: Uint8Array) =>
  startsWith(bytes, SIGNATURES[type]);

/**
 * A file name fit to keep and to hand back in a download: no folders, no
 * control characters, at most 255 characters. Empty becomes "Contract".
 */
export function fileName(name: string | undefined): string {
  const bare = (name ?? '')
    .split(/[/\\]/)
    .at(-1)!
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"]/g, '')
    .trim();
  return bare.slice(0, 255).trim() || 'Contract';
}

/** Opens in the browser (PDFs and images) or downloads (Word). */
export function disposition(type: ContractDocumentType, name: string): string {
  const inline = type === 'application/pdf' || type.startsWith('image/');
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/[\\;]/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
