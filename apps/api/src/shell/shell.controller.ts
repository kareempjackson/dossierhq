import type { Shell } from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { Controller, Get, Inject } from '@nestjs/common';
import { UserId, WorkspaceId } from '../common/workspace.js';
import { DATABASE } from '../database/database.module.js';
import { DeliveryService } from '../delivery/delivery.service.js';
import { ReportsService } from '../reports/reports.service.js';

/**
 * What the chrome around every page reads, in one request instead of one
 * for the bell and four for the command palette.
 */
@Controller('shell')
export class ShellController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly reports: ReportsService,
    private readonly delivery: DeliveryService,
  ) {}

  @Get()
  async shell(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<Shell> {
    const [unread, clients, queue, waiting] = await Promise.all([
      this.db.notifications.countUnread(workspaceId, userId),
      this.db.clients.overview(workspaceId),
      this.reports.queue(workspaceId),
      this.delivery.waiting(workspaceId),
    ]);
    return {
      unread,
      clients,
      reports: [...queue, ...waiting].map((report) => ({
        id: report.id,
        clientId: report.clientId,
        weekStart: report.weekStart,
      })),
    };
  }
}
