import {
  Controller,
  Get,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { AuthService } from './auth.service.js';
import {
  AuthGuard,
  CurrentActor,
  Roles,
  RolesGuard,
  type AuthenticatedActor,
} from './authorization.js';

@Controller('authorization-test')
class AuthorizationTestController {
  @Get('customer')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CUSTOMER')
  customer(@CurrentActor() actor: AuthenticatedActor) {
    return { role: actor.role };
  }

  @Get('admin')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN')
  admin(@CurrentActor() actor: AuthenticatedActor) {
    return { role: actor.role };
  }

  @Get('either')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CUSTOMER', 'ADMIN')
  either(@CurrentActor() actor: AuthenticatedActor) {
    return { role: actor.role };
  }
}

describe('role-based authorization', () => {
  let app: INestApplication;
  let server: Server;
  const actors: Record<string, AuthenticatedActor> = {
    customer: { userId: '101', sessionId: '201', role: 'CUSTOMER' },
    admin: { userId: '102', sessionId: '202', role: 'ADMIN' },
  };
  const auth = {
    authenticate: vi.fn((token?: string) => {
      const actor = token ? actors[token] : undefined;
      if (!actor) throw new UnauthorizedException();
      return actor;
    }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthorizationTestController],
      providers: [
        AuthGuard,
        RolesGuard,
        { provide: AuthService, useValue: auth },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => app.close());
  beforeEach(() => {
    auth.authenticate.mockClear();
  });

  it('requires a valid authenticated session before role authorization', async () => {
    const response = await request(server)
      .get('/authorization-test/admin')
      .expect(401);
    expect((response.body as { statusCode: number }).statusCode).toBe(401);
    expect(auth.authenticate).toHaveBeenCalledOnce();
  });

  it('returns 403 when an authenticated customer requests an admin route', async () => {
    await request(server)
      .get('/authorization-test/admin')
      .set('Authorization', 'Bearer customer')
      .expect(403);
  });

  it('returns 403 when an authenticated admin requests a customer-only route', async () => {
    await request(server)
      .get('/authorization-test/customer')
      .set('Authorization', 'Bearer admin')
      .expect(403);
  });

  it('allows each role on routes that declare both roles', async () => {
    await request(server)
      .get('/authorization-test/either')
      .set('Authorization', 'Bearer customer')
      .expect(200, { role: 'CUSTOMER' });
    await request(server)
      .get('/authorization-test/either')
      .set('Authorization', 'Bearer admin')
      .expect(200, { role: 'ADMIN' });
  });

  it('ignores client-supplied identity and role headers', async () => {
    await request(server)
      .get('/authorization-test/admin')
      .set('Authorization', 'Bearer customer')
      .set('x-authenticated-role', 'ADMIN')
      .set('x-authenticated-user-id', '102')
      .set('x-roles', 'ADMIN')
      .expect(403);
  });
});
