import { Global, Injectable, Logger, Module } from '@nestjs/common';

/** Requests come in bursts: pass a workspace's use on at most this often. */
const NOTE_EVERY_MS = 60_000;

/**
 * Which workspaces someone is using, as their signed-in requests arrive, so
 * tools sync when their data is wanted. In this process's memory only.
 */
@Injectable()
export class WorkspaceActivity {
  private readonly logger = new Logger(WorkspaceActivity.name);
  private readonly noted = new Map<string, number>();
  private readonly listeners = new Set<(workspaceId: string) => void>();

  /** A signed-in request for the workspace; listeners hear at most once a minute. */
  seen(workspaceId: string, now = Date.now()) {
    const last = this.noted.get(workspaceId);
    if (last !== undefined && now - last < NOTE_EVERY_MS) return;
    this.noted.set(workspaceId, now);
    for (const listener of this.listeners) {
      try {
        listener(workspaceId);
      } catch (error) {
        // A listener's problem is never the request's.
        this.logger.warn((error as Error)?.message ?? String(error));
      }
    }
  }

  /** Calls `listener` when a workspace is in use; returns an unsubscribe. */
  onSeen(listener: (workspaceId: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

@Global()
@Module({ providers: [WorkspaceActivity], exports: [WorkspaceActivity] })
export class ActivityModule {}
