import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Sse,
  UseGuards,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthService } from '../auth/auth.service.js';
import { AuthGuard } from '../shared/guards/auth.guard.js';
import { RolesGuard } from '../shared/guards/roles.guard.js';
import { Roles } from '../shared/decorators/roles.decorator.js';
import {
  CurrentActor,
  type AuthenticatedActor,
  type AuthenticatedRequest,
} from '../shared/decorators/current-actor.decorator.js';
import { NotificationService } from './notification.service.js';
import { NotificationStream } from './notification.stream.js';

@Controller('notifications')
@UseGuards(AuthGuard, RolesGuard)
@Roles('CUSTOMER')
export class NotificationController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly stream: NotificationStream,
    private readonly auth: AuthService,
  ) {}

  @Get()
  list(
    @CurrentActor() actor: AuthenticatedActor,
    @Query('page') pageValue?: string,
    @Query('pageSize') sizeValue?: string,
    @Query('unreadOnly') unreadValue?: string,
  ) {
    const page = pageValue === undefined ? 1 : Number(pageValue);
    const pageSize = sizeValue === undefined ? 20 : Number(sizeValue);
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100 ||
      (unreadValue !== undefined &&
        unreadValue !== 'true' &&
        unreadValue !== 'false')
    )
      throw new BadRequestException({ code: 'VALIDATION_FAILED' });
    return this.notifications.list(
      actor,
      page,
      pageSize,
      unreadValue === 'true',
    );
  }

  @Get('unread-count') unreadCount(@CurrentActor() actor: AuthenticatedActor) {
    return this.notifications.unreadCount(actor);
  }
  @Patch('read-all') markAllRead(@CurrentActor() actor: AuthenticatedActor) {
    return this.notifications.markAllRead(actor);
  }
  @Patch(':id/read') markRead(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id') id: string,
  ) {
    return this.notifications.markRead(actor, id);
  }

  @Sse('stream')
  streamNotifications(
    @CurrentActor() actor: AuthenticatedActor,
    @Req() request: AuthenticatedRequest,
  ) {
    const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    return new Observable<{ type: string; data: object }>((subscriber) => {
      const userId = BigInt(actor.userId);
      const changes = this.stream
        .connect(userId)
        .subscribe((signal) =>
          subscriber.next({ type: signal.type, data: {} }),
        );
      subscriber.next({ type: 'notifications.sync', data: {} });
      const timer = setInterval(() => {
        void this.auth
          .authenticate(token)
          .then((current) => {
            if (
              current.userId !== actor.userId ||
              current.role !== 'CUSTOMER'
            ) {
              subscriber.complete();
              return;
            }
            subscriber.next({ type: 'notifications.sync', data: {} });
          })
          .catch(() => subscriber.complete());
      }, 15_000);
      return () => {
        clearInterval(timer);
        changes.unsubscribe();
        this.stream.disconnect(userId);
      };
    });
  }
}
