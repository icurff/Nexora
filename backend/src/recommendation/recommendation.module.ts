import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { TrackingIdentityModule } from '../tracking/tracking-identity.module.js';

import { RecommendationController } from './recommendation.controller.js';
import { RecommendationRepository } from './recommendation.repository.js';
import { RecommendationService } from './recommendation.service.js';
import { AiRecommendationClient } from './ai-recommendation.client.js';
import { AdaptiveRecommendationService } from './adaptive-recommendation.service.js';

@Module({
  imports: [AuthModule, TrackingIdentityModule],
  controllers: [RecommendationController],
  providers: [
    RecommendationRepository,
    RecommendationService,
    AiRecommendationClient,
    AdaptiveRecommendationService,
  ],
  exports: [RecommendationService],
})
export class RecommendationModule {}
