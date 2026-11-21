import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TrackingIdentityModule } from './tracking-identity.module.js';
import { TrackingController } from './tracking.controller.js';
import { TrackingGraphRepository } from './tracking-graph.repository.js';
import { TrackingService } from './tracking.service.js';

@Module({
  imports: [AuthModule, TrackingIdentityModule],
  controllers: [TrackingController],
  providers: [TrackingService, TrackingGraphRepository],
  exports: [TrackingService],
})
export class TrackingModule {}
