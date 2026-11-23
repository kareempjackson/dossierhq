import { Module } from '@nestjs/common';
import { MemoryModule } from '../memory/memory.module.js';
import { ProgressController } from './progress.controller.js';

@Module({
  imports: [MemoryModule],
  controllers: [ProgressController],
})
export class ProgressModule {}
