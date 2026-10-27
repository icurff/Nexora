import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { UserRole } from '../database/entities/user.entity.js';
import { AuthService } from './auth.service.js';

export const ROLES_KEY = 'auth:roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export type AuthenticatedActor = {
  userId: string;
  sessionId: string;
  role: UserRole;
};

type AuthenticatedRequest = Request & { actor?: AuthenticatedActor };

const bearer = (value?: string) => value?.match(/^Bearer\s+(.+)$/i)?.[1];

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.actor = await this.auth.authenticate(
      bearer(request.headers.authorization),
    );
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;

    const actor = context.switchToHttp().getRequest<AuthenticatedRequest>()
      .actor;
    if (!actor) throw new UnauthorizedException();
    return roles.includes(actor.role);
  }
}

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedActor => {
    const actor = context.switchToHttp().getRequest<AuthenticatedRequest>()
      .actor;
    if (!actor) throw new UnauthorizedException();
    return actor;
  },
);
