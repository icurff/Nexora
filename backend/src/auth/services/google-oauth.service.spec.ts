import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleOAuthService } from './google-oauth.service.js';

describe('GoogleOAuthService', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'client-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'client-secret');
    vi.stubEnv(
      'GOOGLE_REDIRECT_URI',
      'http://localhost:3000/api/v1/auth/google/callback',
    );
    vi.stubEnv('FRONTEND_URL', 'http://localhost:5173');
    vi.stubEnv('COOKIE_SECURE', 'false');
  });

  it('starts a redirect with random state and only permits an internal return path', () => {
    const service = new GoogleOAuthService();
    const flow = service.begin('https://attacker.example/');
    const url = new URL(flow.url);

    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/v1/auth/google/callback',
    );
    expect(url.searchParams.get('state')).toBe(flow.stateCookie);
    expect(flow.returnToCookie).toBe('/account');
    expect(url.searchParams.has('code_challenge')).toBe(false);
    expect(url.searchParams.has('nonce')).toBe(false);
  });

  it('rejects a callback whose state does not match the browser cookie', async () => {
    const service = new GoogleOAuthService();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      service.complete(
        'authorization-code',
        'state-from-google',
        'other-state',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('provides a distinct frontend error when OAuth credentials are missing', () => {
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '');
    const service = new GoogleOAuthService();

    expect(service.isConfigured()).toBe(false);
    expect(
      new URL(service.configurationErrorUrl()).searchParams.get('googleError'),
    ).toBe('configuration');
  });
});
