import { ApiError } from '@/lib/api';
import { openContractDocument } from '@/lib/data';

/** What the API says about the file that the browser should hear too. */
const PASSED_ON = [
  'content-type',
  'content-length',
  'content-disposition',
  'x-content-type-options',
  'content-security-policy',
  'cache-control',
];

/**
 * A file kept with a client's contract. The browser never talks to the API,
 * so this passes the API's answer on, with the session's say-so.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<'/clients/[id]/contract/[documentId]'>,
) {
  const { id, documentId } = await ctx.params;
  try {
    const file = await openContractDocument(id, documentId);
    const headers = new Headers();
    for (const name of PASSED_ON) {
      const value = file.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(file.body, { headers });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return new Response('That file isn’t here any more.', { status: 404 });
    }
    throw error;
  }
}
