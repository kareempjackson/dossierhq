import type {
  ReportDelivery,
  ReportDeliveryStatus,
  ReportEmail,
} from '@dossierhq/contracts';
import {
  BadGatewayException,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { UserId, WorkspaceId } from '../common/workspace.js';
import { DeliveryService } from '../delivery/delivery.service.js';

/** One report on its way to the client. The outbox is on ReportsController. */
@Controller('reports')
export class ReportDeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  /** Who it goes to, when, and every try so far. */
  @Get(':id/delivery')
  status(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<ReportDeliveryStatus> {
    return this.delivery.status(workspaceId, id);
  }

  /** The email it goes out as, to look at before it does. */
  @Get(':id/email')
  email(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<ReportEmail> {
    return this.delivery.preview(workspaceId, id);
  }

  /**
   * Sends an approved report now. 201 with the delivery; 409 when it isn't
   * approved, has gone already, or has no one to go to; 502 with the reason
   * when the mail provider turns it down (the try is still logged).
   */
  @Post(':id/send')
  async send(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Param('id') id: string,
  ): Promise<ReportDelivery> {
    const delivery = await this.delivery.send(workspaceId, id, userId);
    if (delivery.outcome === 'failed') {
      throw new BadGatewayException(delivery.problem);
    }
    return delivery;
  }
}
