import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';

export type GoogleProfile = {
  subject: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
};

const googleKeys = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);
const googleStateCookieName = 'nexora_google_state';
const googleReturnToCookieName = 'nexora_google_return_to';
const defaultReturnTo = '/account';

@Injectable()
export class GoogleOAuthService {
  private readonly clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? '';
  private readonly clientSecret =
    process.env.GOOGLE_CLIENT_SECRET?.trim() ?? '';
  private readonly redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim() ?? '';
  private readonly frontendUrl = process.env.FRONTEND_URL?.trim() ?? '';
  private readonly secureCookie = process.env.COOKIE_SECURE === 'true';

  begin(returnTo?: string) {
    this.assertConfigured();
    const state = randomBytes(32).toString('base64url');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    return {
      url: url.toString(),
      stateCookie: state,
      returnToCookie: this.safeReturnTo(returnTo),
    };
  }

  async complete(
    code: string,
    state: string,
    stateCookie?: string,
    returnToCookie?: string,
  ) {
    this.assertConfigured();
    this.verifyState(state, stateCookie);
    const tokens = await this.exchangeCode(code);
    if (typeof tokens.id_token !== 'string')
      throw new UnauthorizedException('Google did not return an ID token');

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(tokens.id_token, googleKeys, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: this.clientId,
        maxTokenAge: '10 minutes',
      }));
    } catch {
      throw new UnauthorizedException('Google ID token is invalid');
    }

    if (
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string' ||
      payload.email_verified !== true
    )
      throw new UnauthorizedException('Google account is not verified');

    const email = payload.email.trim().toLowerCase();
    if (!email || email.length > 254)
      throw new UnauthorizedException('Google account is not valid');
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    const fullName = (name || email.split('@')[0] || 'Google Customer').slice(
      0,
      100,
    );
    const avatarUrl = this.googleAvatarUrl(payload.picture);
    return {
      profile: {
        subject: payload.sub,
        email,
        fullName,
        avatarUrl,
      } satisfies GoogleProfile,
      returnTo: this.safeReturnTo(returnToCookie),
    };
  }

  successUrl(returnTo: string) {
    const url = new URL('/auth/google/callback', this.frontendBaseUrl());
    url.searchParams.set('returnTo', this.safeReturnTo(returnTo));
    return url.toString();
  }

  failureUrl() {
    const url = new URL('/login', this.frontendBaseUrl());
    url.searchParams.set('googleError', '1');
    return url.toString();
  }

  configurationErrorUrl() {
    const url = new URL('/login', this.frontendBaseUrl());
    url.searchParams.set('googleError', 'configuration');
    return url.toString();
  }

  isConfigured() {
    return Boolean(this.clientId && this.clientSecret && this.redirectUri);
  }

  stateCookie(value: string, maxAge = 600) {
    return `${googleStateCookieName}=${encodeURIComponent(value)}; Path=/api/v1/auth/google; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${this.secureCookie ? '; Secure' : ''}`;
  }

  returnToCookie(value: string, maxAge = 600) {
    return `${googleReturnToCookieName}=${encodeURIComponent(value)}; Path=/api/v1/auth/google; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${this.secureCookie ? '; Secure' : ''}`;
  }

  clearStateCookie() {
    return this.stateCookie('', 0);
  }

  clearReturnToCookie() {
    return this.returnToCookie('', 0);
  }

  static get stateCookieName() {
    return googleStateCookieName;
  }

  static get returnToCookieName() {
    return googleReturnToCookieName;
  }

  private async exchangeCode(code: string) {
    let response: Response;
    try {
      response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri,
          grant_type: 'authorization_code',
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ServiceUnavailableException('Google sign-in is unavailable');
    }
    if (!response.ok)
      throw new UnauthorizedException('Google authorization code is invalid');
    try {
      return (await response.json()) as { id_token?: unknown };
    } catch {
      throw new ServiceUnavailableException(
        'Google returned an invalid response',
      );
    }
  }

  private verifyState(value: string, cookieValue?: string) {
    if (
      !value ||
      value.length > 128 ||
      !cookieValue ||
      !this.safeEqual(value, cookieValue)
    )
      throw new UnauthorizedException('Google OAuth state is invalid');
    return true;
  }

  private safeReturnTo(value?: string) {
    if (
      typeof value !== 'string' ||
      !value.startsWith('/') ||
      value.startsWith('//') ||
      value.includes('\\') ||
      [...value].some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      }) ||
      value.length > 2048
    )
      return defaultReturnTo;
    try {
      const url = new URL(value, 'https://nexora.invalid');
      if (url.origin !== 'https://nexora.invalid') return defaultReturnTo;
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return defaultReturnTo;
    }
  }

  private googleAvatarUrl(value: unknown) {
    if (typeof value !== 'string' || value.length > 2048) return null;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' &&
        url.hostname.endsWith('.googleusercontent.com')
        ? url.toString()
        : null;
    } catch {
      return null;
    }
  }

  private safeEqual(left: string, right: string) {
    const leftBytes = Buffer.from(left);
    const rightBytes = Buffer.from(right);
    return (
      leftBytes.length === rightBytes.length &&
      timingSafeEqual(leftBytes, rightBytes)
    );
  }

  private assertConfigured() {
    if (!this.isConfigured())
      throw new ServiceUnavailableException('Google sign-in is not configured');
    try {
      new URL(this.redirectUri);
      this.frontendBaseUrl();
    } catch {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }
  }

  private frontendBaseUrl() {
    const url = new URL(this.frontendUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    return url;
  }
}
