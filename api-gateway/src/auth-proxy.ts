import type { Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

export function createAuthProxy() {
  const configuredTimeout = Number(process.env.AUTH_SERVICE_TIMEOUT_MS ?? 5000);
  const timeout =
    Number.isSafeInteger(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : 5000;
  const timedOutRequests = new WeakSet<Request>();

  return createProxyMiddleware<Request, Response>({
    target: process.env.AUTH_SERVICE_URL ?? 'http://localhost:3001',
    changeOrigin: true,
    proxyTimeout: timeout,
    // Register at the application root so the full /api/v1/auth path is preserved.
    pathFilter: (pathname) => {
      if (pathname !== '/api/v1/auth' && !pathname.startsWith('/api/v1/auth/'))
        return false;

      // Reject encoded traversal and separators before the proxy builds the upstream URL.
      try {
        return pathname.split('/').every((segment) => {
          const value = decodeURIComponent(segment);
          return (
            value !== '.' &&
            value !== '..' &&
            !value.includes('/') &&
            !value.includes('\\')
          );
        });
      } catch {
        return false;
      }
    },
    on: {
      proxyReq: (proxyRequest, request) => {
        // Identity must come from verified authentication, never client-supplied headers.
        for (const name of proxyRequest.getHeaderNames()) {
          if (
            name.startsWith('x-user-') ||
            name.startsWith('x-authenticated-user-') ||
            name.startsWith('x-forwarded-') ||
            name === 'x-roles' ||
            name === 'x-permissions'
          ) {
            proxyRequest.removeHeader(name);
          }
        }
        proxyRequest.once('timeout', () => timedOutRequests.add(request));
      },
      error: (_error, request, response) => {
        if (!('writeHead' in response) || response.headersSent) {
          response.destroy();
          return;
        }

        const statusCode = timedOutRequests.has(request) ? 504 : 502;
        response.status(statusCode).json({
          statusCode,
          message:
            statusCode === 504
              ? 'Auth service timed out'
              : 'Auth service unavailable',
        });
      },
    },
  });
}
