import { progressQuerySchema } from '@dossierhq/contracts';
import type { NextRequest } from 'next/server';
import { getProgress } from '@/lib/data/progress';

/**
 * Where a sync, a read of past records or an answer stands, for the page
 * that is waiting on it (see RefreshWhileSyncing). A few bytes from the
 * API: the page asks this every few seconds, and draws itself again only
 * when the answer changes.
 */
export async function GET(request: NextRequest) {
  const query = progressQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!query.success) return new Response(null, { status: 400 });
  try {
    const progress = await getProgress(query.data.watch, query.data.id);
    return Response.json(progress, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch {
    // Signed out, or the API is away: the page keeps what it shows.
    return new Response(null, { status: 503 });
  }
}
