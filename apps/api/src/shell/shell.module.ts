import { Module } from '@nestjs/common';
import { DeliveryModule } from '../delivery/delivery.module.js';
import { ReportsModule } from '../reports/reports.module.js';
import { ShellController } from './shell.controller.js';

@Module({
  imports: [ReportsModule, DeliveryModule],
  controllers: [ShellController],
})
export class ShellModule {}
