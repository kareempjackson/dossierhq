import { getMe } from '@/lib/data/auth';
import { orNull } from '@/lib/data/safe';
import { getShell } from '@/lib/data/shell';
import { paletteData } from '@/lib/today-views';
import { PaletteSync, UnreadSync } from './shell-sync';

/**
 * What every workspace page's chrome reads from the API: one request, inside
 * a Suspense in the workspace layout so the page never waits for it. If the
 * API can't say, the chrome keeps what it had.
 */

/** The bell's badge, and the clients and reports the palette jumps to. */
export async function ShellData() {
  const [me, shell] = await Promise.all([
    getMe().catch(orNull),
    getShell().catch(orNull),
  ]);
  if (!shell) return null;
  return (
    <>
      <UnreadSync unread={shell.unread} />
      {me && (
        <PaletteSync
          palette={paletteData(shell, {
            timeZone: me.workspace.timeZone,
            now: new Date(),
          })}
        />
      )}
    </>
  );
}
