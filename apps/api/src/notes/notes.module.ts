import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { InboundController, NotesController } from './notes.controller.js';
import { NotesService } from './notes.service.js';

@Module({
  imports: [AuthModule],
  controllers: [NotesController, InboundController],
  providers: [NotesService],
})
export class NotesModule {}
