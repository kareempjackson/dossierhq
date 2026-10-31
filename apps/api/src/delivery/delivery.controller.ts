import {
  LOGO_MAX_BYTES,
  LOGO_TYPES,
  recipientsUpdateSchema,
  reportSettingsUpdateSchema,
  type List,
  type LogoType,
  type Recipient,
  type RecipientsUpdate,
  type ReportSettings,
} from '@dossierhq/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  PayloadTooLargeException,
  Put,
  Req,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditLog } from '../audit/audit-log.js';
import { DuringOnboarding } from '../auth/onboarding.decorator.js';
import { RequireRole } from '../auth/role.decorator.js';
import { UserId, WorkspaceId } from '../common/workspace.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DeliveryService } from './delivery.service.js';

const MANAGE = 'change how reports go out';

/** How weekly reports look when they go out, and when; onboarding sets the branding. */
@Controller('report-settings')
@DuringOnboarding()
export class ReportSettingsController {
  constructor(
    private readonly delivery: DeliveryService,
    private readonly audit: AuditLog,
  ) {}

  @Get()
  get(@WorkspaceId() workspaceId: string): Promise<ReportSettings> {
    return this.delivery.settings(workspaceId);
  }

  /** Everything but the logo, which has its own route. */
  @Put()
  @RequireRole('admin', MANAGE)
  async save(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Body(new ZodValidationPipe(reportSettingsUpdateSchema))
    update: ReportSettingsUpdateParsed,
  ): Promise<ReportSettings> {
    const saved = await this.delivery.saveSettings(workspaceId, update);
    await this.audit.record(workspaceId, userId, {
      kind: 'change',
      what: 'Changed how weekly reports go out',
    });
    return saved;
  }

  /**
   * The logo as the request body, a PNG or JPEG of at most 256 KB, sent
   * with its own Content-Type.
   */
  @Put('logo')
  @RequireRole('admin', MANAGE)
  async setLogo(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Headers('content-type') contentType: string | undefined,
    @Req() req: Request,
  ): Promise<ReportSettings> {
    const type = contentType?.split(';')[0]?.trim().toLowerCase();
    const body: unknown = req.body;
    if (!isLogoType(type) || !Buffer.isBuffer(body) || body.length === 0) {
      throw new UnsupportedMediaTypeException(
        'Upload the logo as a PNG or JPEG.',
      );
    }
    if (body.length > LOGO_MAX_BYTES) {
      throw new PayloadTooLargeException('Keep the logo under 256 KB.');
    }
    if (!looksLike(type, body)) {
      throw new UnsupportedMediaTypeException(
        `That file isn’t a ${type === 'image/png' ? 'PNG' : 'JPEG'}.`,
      );
    }
    const saved = await this.delivery.setLogo(workspaceId, {
      type,
      bytes: body,
    });
    await this.audit.record(workspaceId, userId, {
      kind: 'change',
      what: 'Changed the logo on weekly reports',
    });
    return saved;
  }

  @Delete('logo')
  @RequireRole('admin', MANAGE)
  async removeLogo(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<ReportSettings> {
    const saved = await this.delivery.setLogo(workspaceId, null);
    await this.audit.record(workspaceId, userId, {
      kind: 'change',
      what: 'Removed the logo from weekly reports',
    });
    return saved;
  }
}

/** Who each client's weekly report goes to. */
@Controller('clients')
export class RecipientsController {
  constructor(
    private readonly delivery: DeliveryService,
    private readonly audit: AuditLog,
  ) {}

  @Get(':id/recipients')
  async list(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<List<Recipient>> {
    return { data: await this.delivery.recipients(workspaceId, id) };
  }

  /** Replaces the list, in the order given. */
  @Put(':id/recipients')
  @HttpCode(HttpStatus.OK)
  @RequireRole('admin', 'change who gets reports')
  async replace(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(recipientsUpdateSchema))
    { recipients }: Required<RecipientsUpdate>,
  ): Promise<List<Recipient>> {
    const saved = await this.delivery.saveRecipients(
      workspaceId,
      id,
      recipients,
    );
    await this.audit.record(workspaceId, userId, {
      kind: 'change',
      clientId: id,
      what:
        saved.length === 0
          ? 'Removed everyone from the weekly report’s recipients'
          : `Set the weekly report’s recipients to ${saved.map((r) => r.email).join(', ')}`,
    });
    return { data: saved };
  }
}

type ReportSettingsUpdateParsed = Parameters<
  DeliveryService['saveSettings']
>[1];

const isLogoType = (type: string | undefined): type is LogoType =>
  (LOGO_TYPES as readonly string[]).includes(type ?? '');

/** The file's first bytes match its type, so a renamed file is caught. */
function looksLike(type: LogoType, bytes: Buffer): boolean {
  return type === 'image/png'
    ? bytes
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
