import { unstable_rethrow } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { openContractDocument } from '@/lib/data/contracts';

/** What the API said about the file that's safe, and needed, to pass on. */
const PASSED_ON = ['content-type', 'content-length', 'content-disposition'];

/**
 * A contract file, from the API through this app, since the session lives
 * in a cookie only this server reads. PDFs and images open in the browser;
 * Word documents download. Never sniffed, never run, never cached.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<'/clients/[id]/contract/files/[documentId]'>,
) {
  const { id, documentId } = await params;
  try {
    const file = await openContractDocument(id, documentId);
    const headers = new Headers({
      'x-content-type-options': 'nosniff',
      'content-security-policy': 'sandbox',
      'cache-control': 'private, no-store',
    });
    for (const name of PASSED_ON) {
      const value = file.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(file.body, { headers });
  } catch (error) {
    // Lets "sign in again" redirects through.
    unstable_rethrow(error);
    const missing = error instanceof ApiError && error.status === 404;
    return new Response(
      missing
        ? 'That file isn’t kept with this contract any more.'
        : 'Dossier couldn’t open that file. Try again in a moment.',
      {
        status: missing ? 404 : 502,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      },
    );
  }
}
