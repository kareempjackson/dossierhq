import { Module } from '@nestjs/common';
import { MembersController } from './members.controller.js';
import { InviteLimiter, MembersService } from './members.service.js';

@Module({
  controllers: [MembersController],
  providers: [MembersService, InviteLimiter],
})
export class MembersModule {}
