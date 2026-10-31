import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/** A place in a log, at one entry. */
export type LogPosition = { at: string; id: string };

/** Which entries to read: just older than `before`, or just newer than `after`. */
export type LogWindow = {
  before?: LogPosition;
  after?: LogPosition;
  limit: number;
};

export type LogPage<T> = {
  data: T[];
  newer: string | null;
  older: string | null;
};

const positionSchema = z.tuple([z.iso.datetime(), z.string().min(1)]);

/** A cursor names the entry a page turns from. */
const cursorAt = (entry: LogPosition) =>
  Buffer.from(JSON.stringify([entry.at, entry.id])).toString('base64url');

function positionOf(cursor: string, invalid: string): LogPosition {
  try {
    const [at, id] = positionSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString()),
    );
    return { at, id };
  } catch {
    throw new BadRequestException(invalid);
  }
}

/**
 * One page of a log read newest first, turned with the cursors a previous
 * page gave as `before` (older) or `after` (newer). Each read asks for one
 * entry more than the page, to learn if there are more. `invalid` is the 400
 * for a cursor that isn't one.
 */
export async function pageOfLog<T extends LogPosition>(
  read: (window: LogWindow) => Promise<T[]>,
  { before, after, limit }: { before?: string; after?: string; limit: number },
  invalid: string,
): Promise<LogPage<T>> {
  if (after !== undefined) {
    const newer = await read({
      after: positionOf(after, invalid),
      limit: limit + 1,
    });
    if (newer.length > limit) {
      const data = newer.slice(1);
      return {
        data,
        newer: cursorAt(data[0]!),
        older: cursorAt(data.at(-1)!),
      };
    }
    // Back at the top: show a whole page of the newest instead.
  }
  const position =
    before === undefined ? undefined : positionOf(before, invalid);
  const rows = await read({ before: position, limit: limit + 1 });
  const data = rows.slice(0, limit);
  return {
    data,
    newer: position ? cursorAt(data[0] ?? position) : null,
    older: rows.length > limit ? cursorAt(data.at(-1)!) : null,
  };
}
