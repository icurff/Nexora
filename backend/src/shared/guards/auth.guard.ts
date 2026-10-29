import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../decorators/current-actor.decorator.js';
import { AuthService } from '../../auth/auth.service.js';

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
