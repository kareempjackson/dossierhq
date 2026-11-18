import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProductUpdatesController } from './product-updates.controller.js';
import { ProductUpdatesService } from './product-updates.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ProductUpdatesController],
  providers: [ProductUpdatesService],
})
export class ProductUpdatesModule {}
