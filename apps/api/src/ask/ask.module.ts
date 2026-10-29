import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { IntelligenceModule } from '../intelligence/intelligence.module.js';
import { AskController } from './ask.controller.js';
import { AskService } from './ask.service.js';

@Module({
  imports: [AuthModule, IntelligenceModule],
  controllers: [AskController],
  providers: [AskService],
})
export class AskModule {}
