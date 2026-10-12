import type { Clock as ClockReading, Workspace } from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { Controller, Get, Inject } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { notFound } from '../common/not-found.js';
import { WorkspaceId } from '../common/workspace.js';
import { DATABASE } from '../database/database.module.js';

@Controller()
export class WorkspaceController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly clock: Clock,
  ) {}

  @Get('workspace')
  async workspace(@WorkspaceId() workspaceId: string): Promise<Workspace> {
    return (await this.db.workspaces.get(workspaceId)) ?? notFound('Workspace');
  }

  /** The moment the data describes. Pinned for the seeded demo. */
  @Get('clock')
  now(): ClockReading {
    return { now: this.clock.now() };
  }
}
