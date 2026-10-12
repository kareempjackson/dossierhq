import { NotFoundException } from '@nestjs/common';

/** Throws a 404 naming what wasn't found, e.g. `notFound('Report', id)`. */
export function notFound(what: string, id?: string): never {
  throw new NotFoundException(
    id ? `${what} ${id} not found` : `${what} not found`,
  );
}
