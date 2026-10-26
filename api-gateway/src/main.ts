import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { createAuthProxy } from './auth-proxy.js';

const protectedPrefixes = [
  '/api/v1/me',
  '/api/v1/cart',
  '/api/v1/orders',
  '/api/v1/checkout',
  '/api/v1/admin',
];

async function authenticateRequest(
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
) {
  if (
    !protectedPrefixes.some(
      (prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`),
    )
  )
    return next();
  const authorization = req.header('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token)
    return res
      .status(401)
      .json({
        statusCode: 401,
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
      });
  const serviceToken = process.env.AUTH_INTERNAL_TOKEN;
  if (!serviceToken)
    return res
      .status(503)
      .json({
        statusCode: 503,
        code: 'AUTH_UNAVAILABLE',
        message: 'Authentication service unavailable',
      });
  try {
    const response = await fetch(
      `${process.env.AUTH_SERVICE_URL ?? 'http://localhost:3001'}/internal/auth/introspect`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-service-token': serviceToken,
        },
        body: JSON.stringify({ accessToken: token }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok)
      return res
        .status(503)
        .json({
          statusCode: 503,
          code: 'AUTH_UNAVAILABLE',
          message: 'Authentication service unavailable',
        });
    const identity = (await response.json()) as {
      active?: boolean;
      userId?: string;
      sessionId?: string;
      role?: string;
    };
    if (!identity.active)
      return res
        .status(401)
        .json({
          statusCode: 401,
          code: 'UNAUTHENTICATED',
          message: 'Authentication required',
        });
    for (const key of Object.keys(req.headers))
      if (
        key.startsWith('x-user-') ||
        key.startsWith('x-authenticated-user-') ||
        key === 'x-roles'
      )
        delete req.headers[key];
    req.headers['x-authenticated-user-id'] = identity.userId;
    req.headers['x-authenticated-session-id'] = identity.sessionId;
    req.headers['x-authenticated-role'] = identity.role;
    return next();
  } catch {
    return res
      .status(503)
      .json({
        statusCode: 503,
        code: 'AUTH_UNAVAILABLE',
        message: 'Authentication service unavailable',
      });
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(authenticateRequest);
  app.use(createAuthProxy());
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
await bootstrap();
