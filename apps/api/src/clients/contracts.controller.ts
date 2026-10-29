import {
  CONTRACT_DOCUMENT_MAX_BYTES,
  CONTRACT_DOCUMENT_TYPES,
  CONTRACT_DOCUMENTS_MAX,
  contractUpdateSchema,
  type Client,
  type ContractDocument,
  type List,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  PayloadTooLargeException,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AuditLog } from '../audit/audit-log.js';
import { RequireRole } from '../auth/role.decorator.js';
import { notFound } from '../common/not-found.js';
import { UserId, WorkspaceId } from '../common/workspace.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DATABASE } from '../database/database.module.js';
import {
  disposition,
  fileName,
  isDocumentType,
  looksLike,
} from './contract-files.js';

const MANAGE = 'change contracts';
const KINDS = [...new Set(Object.values(CONTRACT_DOCUMENT_TYPES))].join(', ');

/**
 * A client's contract, typed in because no tool records one, and the files
 * kept with it. Everyone in the workspace reads them; owners and admins
 * change them.
 */
@Controller('clients')
export class ContractsController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly audit: AuditLog,
  ) {}

  /** Sets the whole contract. Syncs leave it alone. */
  @Put(':id/contract')
  @RequireRole('admin', MANAGE)
  async setContract(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(contractUpdateSchema))
    contract: Exclude<Client['contract'], null>,
  ): Promise<Client> {
    const before = await this.client(workspaceId, id);
    const client =
      (await this.db.clients.setContract(workspaceId, id, contract)) ??
      notFound('Client', id);
    await this.audit.record(workspaceId, userId, {
      kind: 'change',
      clientId: id,
      what: `${before.contract ? 'Changed' : 'Added'} the contract: ${contract.plan}, ${contract.monthlyFee} ${contract.currency} a month, renewing ${contract.renewsOn}`,
    });
    return client;
  }

  @Delete(':id/contract')
  @RequireRole('admin', MANAGE)
  async clearContract(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Param('id') id: string,
  ): Promise<Client> {
    const client =
      (await this.db.clients.setContract(workspaceId, id, null)) ??
      notFound('Client', id);
    await this.audit.record(workspaceId, userId, {
      kind: 'change',
      clientId: id,
      what: 'Removed the contract’s terms',
    });
    return client;
  }

  /** Newest first, without their content. */
  @Get(':id/contract/documents')
  async documents(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<List<ContractDocument>> {
    await this.client(workspaceId, id);
    return { data: await this.db.contractDocuments.list(workspaceId, id) };
  }

  /**
   * The file is the request body, sent with its own Content-Type; `?name=`
   * is what to call it. A PDF, Word document, PNG or JPEG of at most 10 MB,
   * and at most 20 a client.
   */
  @Post(':id/contract/documents')
  @RequireRole('admin', MANAGE)
  async addDocument(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Param('id') id: string,
    @Query('name') name: string | undefined,
    @Headers('content-type') contentType: string | undefined,
    @Req() req: Request,
  ): Promise<ContractDocument> {
    await this.client(workspaceId, id);
    const type = contentType?.split(';')[0]?.trim().toLowerCase();
    const body: unknown = req.body;
    if (!isDocumentType(type) || !Buffer.isBuffer(body) || body.length === 0) {
      throw new UnsupportedMediaTypeException(`Upload a ${KINDS} file.`);
    }
    if (body.length > CONTRACT_DOCUMENT_MAX_BYTES) {
      throw new PayloadTooLargeException('Keep each file under 10 MB.');
    }
    if (!looksLike(type, body)) {
      throw new UnsupportedMediaTypeException(
        `That file isn’t the ${CONTRACT_DOCUMENT_TYPES[type]} file it says it is.`,
      );
    }
    const existing = await this.db.contractDocuments.list(workspaceId, id);
    if (existing.length >= CONTRACT_DOCUMENTS_MAX) {
      throw new ConflictException(
        `A client can keep ${CONTRACT_DOCUMENTS_MAX} files. Remove one first.`,
      );
    }
    const user = await this.db.users.get(userId);
    const document: ContractDocument = {
      id: `doc-${randomUUID()}`,
      clientId: id,
      name: fileName(name),
      contentType: type,
      size: body.length,
      // Real time, not the pinned demo clock, so files stay in the order added.
      uploadedAt: new Date().toISOString(),
      uploadedBy: { userId, name: user?.name ?? userId },
    };
    await this.db.contractDocuments.add(workspaceId, document, body);
    await this.audit.record(workspaceId, user ?? userId, {
      kind: 'change',
      clientId: id,
      what: `Added “${document.name}” to the contract`,
    });
    return document;
  }

  /** The file itself: PDFs and images open in the browser, Word downloads. */
  @Get(':id/contract/documents/:documentId')
  async download(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.db.contractDocuments.get(workspaceId, documentId);
    if (!file || file.document.clientId !== id) {
      notFound('Document', documentId);
    }
    const { document, content } = file;
    // Never sniffed into something else, and never able to run anything.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', 'sandbox');
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(Buffer.from(content), {
      type: document.contentType,
      length: document.size,
      disposition: disposition(document.contentType, document.name),
    });
  }

  @Delete(':id/contract/documents/:documentId')
  @RequireRole('admin', MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeDocument(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ): Promise<void> {
    const file = await this.db.contractDocuments.get(workspaceId, documentId);
    if (!file || file.document.clientId !== id) {
      notFound('Document', documentId);
    }
    await this.db.contractDocuments.remove(workspaceId, documentId);
    await this.audit.record(workspaceId, userId, {
      kind: 'change',
      clientId: id,
      what: `Removed “${file.document.name}” from the contract`,
    });
  }

  private async client(workspaceId: string, id: string): Promise<Client> {
    return (
      (await this.db.clients.get(workspaceId, id)) ?? notFound('Client', id)
    );
  }
}
