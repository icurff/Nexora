import { Module } from '@nestjs/common';
import { TrackingIdentityService } from './tracking-identity.service.js';

@Module({
  providers: [TrackingIdentityService],
  exports: [TrackingIdentityService],
})
export class TrackingIdentityModule {}
