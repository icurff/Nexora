import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  HttpCode,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { TrackingService } from './tracking.service.js';
import {
  TrackingIdentityService,
  TRACKING_VISITOR_COOKIE,
} from './tracking-identity.service.js';
import { TrackEventDto } from './dto/track-event.dto.js';

@Controller('tracking')
export class TrackingController {
  constructor(
    private readonly tracking: TrackingService,
    private readonly identity: TrackingIdentityService,
    private readonly auth: AuthService,
  ) {}

  @Post('events')
  @HttpCode(200)
  async recordEvent(
    @Body() body: TrackEventDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Guest được phép gửi sự kiện.
    // Nếu có Bearer token, bắt buộc xác thực thành công.
    let userId: string | undefined;
    const authorization = req.headers.authorization;

    if (authorization !== undefined) {
      const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];

      if (!token) {
        throw new UnauthorizedException();
      }

      const actor = await this.auth.authenticate(token);
      userId = actor.userId;
    }

    const visitorToken = req.headers.cookie
      ?.split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${TRACKING_VISITOR_COOKIE}=`))
      ?.slice(TRACKING_VISITOR_COOKIE.length + 1);

    const context = await this.identity.resolve(visitorToken, userId);

    // Identity được xác định ở Backend.
    const result = await this.tracking.track(body, context);

    res.setHeader(
      'Set-Cookie',
      this.identity.visitorCookie(context.visitorToken),
    );

    return result;
  }
}
