import {
  disposition,
  fileName,
  isDocumentType,
  looksLike,
} from './contract-files.js';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const DOCX = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

describe('contract files', () => {
  it('takes PDFs, Word documents and images only', () => {
    expect(isDocumentType('application/pdf')).toBe(true);
    expect(isDocumentType('image/jpeg')).toBe(true);
    expect(isDocumentType('text/html')).toBe(false);
    expect(isDocumentType('constructor')).toBe(false);
    expect(isDocumentType(undefined)).toBe(false);
  });

  it('checks a file is what its type says', () => {
    expect(looksLike('application/pdf', PDF)).toBe(true);
    expect(looksLike('application/pdf', DOCX)).toBe(false);
    expect(
      looksLike(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        DOCX,
      ),
    ).toBe(true);
    expect(looksLike('image/png', PDF)).toBe(false);
    expect(looksLike('application/pdf', new Uint8Array())).toBe(false);
  });

  it('keeps only the name of a file, without anything that could trip a download', () => {
    expect(fileName('C:\\Users\\sam\\Signed contract.pdf')).toBe(
      'Signed contract.pdf',
    );
    expect(fileName('../../etc/passwd')).toBe('passwd');
    expect(fileName('a"b\u0000\nc.pdf')).toBe('abc.pdf');
    expect(fileName('  ')).toBe('Contract');
    expect(fileName(undefined)).toBe('Contract');
    expect(fileName('x'.repeat(300))).toHaveLength(255);
  });

  it('opens PDFs and images in the browser, and downloads Word', () => {
    expect(disposition('application/pdf', 'Signed – 2026.pdf')).toBe(
      `inline; filename="Signed _ 2026.pdf"; filename*=UTF-8''Signed%20%E2%80%93%202026.pdf`,
    );
    expect(disposition('application/msword', 'old.doc')).toMatch(
      /^attachment; filename="old.doc"/,
    );
  });
});
