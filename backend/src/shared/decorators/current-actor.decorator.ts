import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { UserRole } from '../../auth/entities/user.entity.js';

export type AuthenticatedActor = {
  userId: string;
  sessionId: string;
  role: UserRole;
};

export type AuthenticatedRequest = Request & { actor?: AuthenticatedActor };

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedActor => {
    const actor = context.switchToHttp().getRequest<AuthenticatedRequest>()
      .actor;
    if (!actor) throw new UnauthorizedException();
    return actor;
  },
);
