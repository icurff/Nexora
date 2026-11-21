import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Optional,
  Param,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import type { Request, Response } from 'express';

import { AuthService } from '../auth/auth.service.js';
import {
  TrackingIdentityService,
  TRACKING_VISITOR_COOKIE,
} from '../tracking/tracking-identity.service.js';
import { RecommendationGraphStore } from '../tracking/recommendation-graph.store.js';
import type { GraphRecommendation } from '../tracking/recommendation-graph.store.js';
import { RecommendationService } from './recommendation.service.js';
import { AiRecommendationClient } from './ai-recommendation.client.js';
import { AdaptiveRecommendationService } from './adaptive-recommendation.service.js';

class RecommendationQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 10;
}

@Controller('recommendations')
export class RecommendationController {
  constructor(
    private readonly recommendations: RecommendationService,
    private readonly identity: TrackingIdentityService,
    private readonly auth: AuthService,
    private readonly aiClient: AiRecommendationClient,
    private readonly adaptive: AdaptiveRecommendationService,
    @Optional() private readonly graph?: RecommendationGraphStore,
  ) {}

  private modelVisitorId(actor?: { userId: string; role: string }) {
    const configuredUser = process.env.DEMO_RECOMMENDATION_USER_ID;
    const configuredVisitor = process.env.DEMO_RECOMMENDATION_VISITOR_ID;
    const visitorId = Number(configuredVisitor);
    return actor?.role === 'ADMIN' &&
      actor.userId === configuredUser &&
      configuredVisitor &&
      /^[1-9]\d*$/.test(configuredVisitor) &&
      Number.isSafeInteger(visitorId)
      ? visitorId
      : undefined;
  }

  private async authenticate(req: Request) {
    const authorization = req.headers.authorization;

    if (authorization === undefined) return undefined;

    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];

    if (!token) throw new UnauthorizedException();

    return this.auth.authenticate(token);
  }

  private visitorToken(req: Request) {
    return req.headers.cookie
      ?.split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${TRACKING_VISITOR_COOKIE}=`))
      ?.slice(TRACKING_VISITOR_COOKIE.length + 1);
  }

  //Nếu database lỗi, Recommendation trả danh sách rỗng thay vì làm hỏng trang. Lỗi vẫn được ghi vào backend logs để kiểm tra.
  private readonly logger = new Logger(RecommendationController.name);
  private async safeRecommend(
    operation: string,
    action: () => Promise<unknown>,
  ) {
    try {
      return await action();
    } catch (error) {
      this.logger.error(
        `Recommendation ${operation} failed`,
        error instanceof Error ? error.stack : String(error),
      );

      return {
        source: 'rule_based' as const,
        strategy: 'unavailable',
        items: [],
      };
    }
  }

  private async graphResponse(
    sessionId: bigint,
    surface: GraphRecommendation['surface'],
    action: () => Promise<unknown>,
    contextProductId?: string,
  ) {
    const result = await this.safeRecommend(surface, action);
    this.graph?.record(sessionId, surface, result, contextProductId);
    return result;
  }

  @Get('home')
  async home(
    @Query() query: RecommendationQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const actor = await this.authenticate(req);

    const context = await this.identity.resolve(
      this.visitorToken(req),
      actor?.userId,
    );

    res.setHeader(
      'Set-Cookie',
      this.identity.visitorCookie(context.visitorToken),
    );

    return this.graphResponse(context.trackingSessionId, 'home', () =>
      this.adaptive.home(
        context.visitorId,
        query.limit,
        this.modelVisitorId(actor),
      ),
    );
  }

  @Get('products/:id')
  async similar(
    @Param('id') id: string,
    @Query() query: RecommendationQueryDto,
  ) {
    if (!/^[1-9]\d*$/.test(id)) {
      throw new BadRequestException('Invalid product ID');
    }

    const productId = BigInt(id);

    if (productId > 9223372036854775807n) {
      throw new BadRequestException('Invalid product ID');
    }

    return this.safeRecommend('similar', () =>
      this.recommendations.similar(productId, query.limit),
    );
  }

  @Get('cart')
  async cart(@Query() query: RecommendationQueryDto, @Req() req: Request) {
    const actor = await this.authenticate(req);

    if (!actor) throw new UnauthorizedException();

    return this.safeRecommend('cart', () =>
      this.recommendations.cart(BigInt(actor.userId), query.limit),
    );
  }

  // Contextual session ranking; original similar/cart routes remain DACN-65.
  @Get('products/:id/session')
  async productSession(
    @Param('id') id: string,
    @Query() query: RecommendationQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!/^[1-9]\d*$/.test(id) || BigInt(id) > 9223372036854775807n) {
      throw new BadRequestException('Invalid product ID');
    }
    const actor = await this.authenticate(req);
    return this.safeRecommend('product-session', async () => {
      const context = await this.identity.resolve(
        this.visitorToken(req),
        actor?.userId,
      );
      res.setHeader(
        'Set-Cookie',
        this.identity.visitorCookie(context.visitorToken),
      );
      return this.graphResponse(
        context.trackingSessionId,
        'detail',
        () =>
          this.adaptive.detail(
            context.visitorId,
            BigInt(id),
            query.limit,
            this.modelVisitorId(actor),
          ),
        id,
      );
    });
  }

  @Get('cart/session')
  async cartSession(
    @Query() query: RecommendationQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const actor = await this.authenticate(req);
    if (!actor) throw new UnauthorizedException();
    return this.safeRecommend('cart-session', async () => {
      const context = await this.identity.resolve(
        this.visitorToken(req),
        actor.userId,
      );
      res.setHeader(
        'Set-Cookie',
        this.identity.visitorCookie(context.visitorToken),
      );
      return this.graphResponse(context.trackingSessionId, 'cart', () =>
        this.adaptive.cart(
          context.visitorId,
          BigInt(actor.userId),
          query.limit,
          this.modelVisitorId(actor),
        ),
      );
    });
  }

  @Get('ai/health')
  async aiHealth() {
    const available = await this.aiClient.health();

    return {
      service: 'nexora-recommendation',
      aiAvailable: available,
    };
  }
}
