import { Module } from '@nestjs/common';
import { RecommendationGraphStore } from './recommendation-graph.store.js';
import { TrackingIdentityService } from './tracking-identity.service.js';

@Module({
  providers: [TrackingIdentityService, RecommendationGraphStore],
  exports: [TrackingIdentityService, RecommendationGraphStore],
})
export class TrackingIdentityModule {}
