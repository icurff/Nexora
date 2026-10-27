import type { INestApplication } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AuthService } from './auth/auth.service.js';
import { configureApp } from './configure-app.js';

describe('monolith HTTP routes', () => {
  let app: INestApplication;
  let server: Server;
  const user = { id: '101', role: 'CUSTOMER' };
  const auth = {
    login: vi.fn(() => ({
      accessToken: 'access',
      refreshToken: 'refresh',
      user,
    })),
    cookie: vi.fn(() => 'nexora_refresh=refresh; Path=/api/v1/auth; HttpOnly'),
    authenticate: vi.fn((token?: string) => {
      if (token !== 'access') throw new UnauthorizedException();
      return { userId: '101', sessionId: '201', role: 'CUSTOMER' };
    }),
    session: vi.fn(() => user),
  };

  beforeAll(async () => {
    // Import the actual root module with test-only DB configuration. The adapter
    // is replaced before Nest initializes; this suite never contacts PostgreSQL.
    for (const [name, value] of Object.entries({
      DATABASE_URL: 'postgresql://test:test@localhost:5432/nexora_http_test',
      DATABASE_SSL_CA: '',
    }))
      vi.stubEnv(name, value);
    const { AppModule } = await import('./app.module.js');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource)
      .useValue({ destroy: vi.fn() })
      .overrideProvider(AuthService)
      .useValue(auth)
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });
  beforeEach(() => vi.clearAllMocks());

  it('does not expose a healthcheck route', async () => {
    await request(server).get('/health').expect(404);
    await request(server).get('/api/v1/health').expect(404);
  });

  it('serves login directly and preserves its refresh cookie', async () => {
    const response = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'customer@example.test', password: 'password' })
      .expect(200);
    expect(response.body).toEqual({ accessToken: 'access', user });
    expect(response.headers['set-cookie']).toEqual([
      'nexora_refresh=refresh; Path=/api/v1/auth; HttpOnly',
    ]);
  });

  it('validates requests before calling Auth', async () => {
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'invalid', password: 'password', role: 'ADMIN' })
      .expect(400);
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('authenticates sessions directly in the Auth module', async () => {
    await request(server).get('/api/v1/auth/session').expect(401);
    await request(server)
      .get('/api/v1/auth/session')
      .set('Authorization', 'Bearer access')
      .expect(200, user);
    expect(auth.authenticate).toHaveBeenLastCalledWith('access');
  });

  it('removes the inter-service introspection endpoint', async () => {
    for (const path of [
      '/internal/auth/introspect',
      '/api/v1/internal/auth/introspect',
    ]) {
      await request(server)
        .post(path)
        .send({ accessToken: 'access' })
        .expect(404);
    }
  });
});
