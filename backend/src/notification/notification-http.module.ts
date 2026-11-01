import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationModule } from './notification.module.js';
import { NotificationController } from './notification.controller.js';

@Module({
  imports: [AuthModule, NotificationModule],
  controllers: [NotificationController],
})
export class NotificationHttpModule {}
