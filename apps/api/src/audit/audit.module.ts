import { Global, Module } from '@nestjs/common';
import { AuditLog } from './audit-log.js';
import { AuditController } from './audit.controller.js';

/** The audit log: read by AuditController, written by every feature through AuditLog. */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditLog],
  exports: [AuditLog],
})
export class AuditModule {}
