import { intelligencePreferencesSchema } from '@dossierhq/contracts';
import { createMemoryAdapter } from '@dossierhq/database/memory';
import { demo } from '@dossierhq/fixtures';
import { HandleBook } from './pack.js';
import { RecordSearch } from './search.js';

const ws = demo.workspace.id;
const everything = intelligencePreferencesSchema.parse({}).records;

const handlesIn = (text: string) => [
  ...new Set([...text.matchAll(/S\d+/g)].map((m) => m[0])),
];

describe('RecordSearch', () => {
  it('finds lines across clients by the words in them, with handles to cite', async () => {
    const db = createMemoryAdapter(demo);
    const search = await RecordSearch.load(db, ws, everything);
    const book = new HandleBook();
    const found = await search.find('backups failed', [], book);
    expect(found).toMatch(/^<search_results>\n/);
    expect(found).toContain(
      'Harbour Dental: critical alert: File server backups have failed three nights running',
    );
    // The best match comes first, and its handles name Harbour's records.
    const [first] = found.split('\n').filter((line) => line.startsWith('- '));
    expect(first).toMatch(/backups have failed/);
    const cited = book.sources(handlesIn(first!));
    expect(cited.length).toBeGreaterThan(0);
    expect(cited.every((s) => s.clientId === 'harbour-dental')).toBe(true);

    // Dates aren't words: "10" finds Windows 10, not every October date.
    const windows = await search.find('Windows 10', ['attention'], book);
    const lines = windows.split('\n').filter((line) => line.startsWith('- '));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).toMatch(/Windows 10/);

    await expect(search.find('zzyzx', [], book)).resolves.toMatch(
      /Nothing matches "zzyzx"/,
    );
    for (const nothing of ['of the', '?']) {
      await expect(search.find(nothing, [], book)).resolves.toMatch(
        /a word or two that names/,
      );
    }
  });

  it('leaves out what the workspace keeps from Claude, and anything citing it', async () => {
    const db = createMemoryAdapter(demo);
    const search = await RecordSearch.load(db, ws, {
      ...everything,
      devices: false,
    });
    const found = await search.find('backups failed', [], new HandleBook());
    // The backup alert rests on NinjaOne device alerts, so it's withheld.
    expect(found).not.toContain('File server backups have failed');
    const devices = await search.find('Windows', ['devices'], new HandleBook());
    expect(devices).toMatch(/Nothing matches/);
  });
});
