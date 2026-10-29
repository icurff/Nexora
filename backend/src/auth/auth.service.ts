import { randomBytes } from 'node:crypto';
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { UserRepository, EmailAlreadyExistsError } from './repositories/user.repository.js';
import { SessionRepository } from './repositories/session.repository.js';
import { PasswordResetTokenRepository } from './repositories/password-reset-token.repository.js';
import bcrypt from 'bcrypt';
import { SignJWT, jwtVerify } from 'jose';
import type { User } from './entities/user.entity.js';
import { hashRefreshToken } from '../database/crypto.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';

type Actor = { userId: string; sessionId: string; role: 'CUSTOMER' | 'ADMIN' };
const userView = (u: User) => ({
  id: u.id,
  email: u.email,
  fullName: u.fullName,
  phone: u.phone,
  role: u.role,
  status: u.status,
  createdAt: u.createdAt.toISOString(),
  updatedAt: u.updatedAt.toISOString(),
});

@Injectable()
export class AuthService {
  private readonly accessKey: Uint8Array;
  private readonly refreshKey: Uint8Array;
  private readonly secureCookie: boolean;
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly passwordResetTokens: PasswordResetTokenRepository,
  ) {
    this.accessKey = this.secret('AUTH_ACCESS_SECRET');
    this.refreshKey = this.secret('AUTH_REFRESH_SECRET');
    this.secureCookie = process.env.COOKIE_SECURE === 'true';
  }
  private secret(name: string): Uint8Array {
    const v = process.env[name] ?? '';
    if (!v.trim()) throw new Error(`${name} is required`);
    return new TextEncoder().encode(v);
  }
  cookie(token: string, maxAge = 604800): string {
    return `nexora_refresh=${encodeURIComponent(token)}; Path=/api/v1/auth; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${this.secureCookie ? '; Secure' : ''}`;
  }
  clearCookie(): string {
    return (
      'nexora_refresh=; Path=/api/v1/auth; HttpOnly; SameSite=Lax; Max-Age=0' +
      (this.secureCookie ? '; Secure' : '')
    );
  }
  private async jwt(
    sub: string,
    sid: string,
    tokenUse: 'access' | 'refresh',
    version?: number,
    ttl = '15m',
  ): Promise<string> {
    const key = tokenUse === 'access' ? this.accessKey : this.refreshKey;
    const jwt = new SignJWT({
      sid,
      tokenUse,
      ...(version === undefined ? {} : { version }),
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime(ttl);
    return jwt.sign(key);
  }
  private async verify(
    token: string,
    use: 'access' | 'refresh',
    ignoreExpiration = false,
  ) {
    const { payload } = await jwtVerify(
      token,
      use === 'access' ? this.accessKey : this.refreshKey,
      {
        algorithms: ['HS256'],
        ...(ignoreExpiration ? { ignoreExp: true } : {}),
      },
    );
    if (
      payload.tokenUse !== use ||
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      !this.validId(payload.sub) || !this.validId(payload.sid)
    )
      throw new UnauthorizedException();
    return { ...payload, sub: payload.sub, sid: payload.sid, version: payload.version };
  }
  private validId(value: string): boolean {
    return /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
  }

  async register(dto: RegisterDto) {
    const fullName = dto.fullName.trim();
    const email = dto.email.trim().toLowerCase();
    if (!fullName || dto.password !== dto.confirmPassword)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED', message: 'Invalid registration data',
        fieldErrors: { confirmPassword: ['Passwords must match'] },
      });
    const passwordHash = await bcrypt.hash(dto.password, 6);
    try {
      return userView(await this.users.createCustomer({ email, passwordHash, fullName }));
    } catch (error) {
      if (error instanceof EmailAlreadyExistsError)
        throw new ConflictException({
          code: 'EMAIL_ALREADY_EXISTS', message: 'Email is already registered',
          fieldErrors: { email: ['Email is already registered'] },
        });
      throw error;
    }
  }

  async login(dto: LoginDto) {
    return this.prisma.transaction(async (transaction) => {
      const user = await this.users.findByEmailForUpdate(dto.email, transaction);
      if (!user || !(await bcrypt.compare(dto.password, user.passwordHash)))
        throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' });
      if (user.status !== 'ACTIVE')
        throw new ForbiddenException({ code: 'ACCOUNT_LOCKED', message: 'Account is locked' });
      const session = await this.sessions.create(
        user.id, randomBytes(32).toString('hex'), new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), transaction,
      );
      const refreshToken = await this.jwt(user.id, session.id, 'refresh', 0, '7d');
      await this.sessions.rotate(session.id, 0, hashRefreshToken(refreshToken), transaction);
      return { accessToken: await this.jwt(user.id, session.id, 'access'), refreshToken, user: userView(user) };
    });
  }

  async refresh(token?: string) {
    if (!token) throw new UnauthorizedException();
    let payload;
    try {
      payload = await this.verify(token, 'refresh');
    } catch {
      throw new UnauthorizedException();
    }
    const result = await this.prisma.transaction(async (transaction) => {
      // All session mutations lock the user before locking or updating sessions.
      const user = await this.users.findByIdForUpdate(payload.sub, transaction);
      if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException();
      const session = await this.sessions.findOwnedForUpdate(payload.sid, user.id, transaction);
      if (!session) throw new UnauthorizedException();
      const valid = session.refreshTokenHash === hashRefreshToken(token) &&
        session.refreshVersion === payload.version && !session.revokedAt && session.expiresAt > new Date();
      if (!valid) {
        if (!session.revokedAt && typeof payload.version === 'number' && session.refreshVersion > payload.version)
          await this.sessions.revoke(session.id, user.id, 'TOKEN_REUSE', transaction);
        // Commit replay revocation before the HTTP layer returns 401.
        return null;
      }
      const version = session.refreshVersion + 1;
      const next = await this.jwt(user.id, session.id, 'refresh', version,
        Math.max(1, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)) + 's');
      await this.sessions.rotate(session.id, version, hashRefreshToken(next), transaction);
      return { accessToken: await this.jwt(user.id, session.id, 'access'), refreshToken: next, user: userView(user) };
    });
    if (!result) throw new UnauthorizedException();
    return result;
  }

  async authenticate(token?: string): Promise<Actor> {
    if (!token) throw new UnauthorizedException();
    let payload;
    try {
      payload = await this.verify(token, 'access');
    } catch {
      throw new UnauthorizedException();
    }
    const actor = await this.sessions.findActiveActor(payload.sid, payload.sub);
    if (!actor) throw new UnauthorizedException();
    return actor;
  }

  async logout(token?: string) {
    if (!token) return;
    let payload;
    try {
      payload = await this.verify(token, 'refresh', true);
    } catch {
      return; // Invalid or forged cookies are cleared by the controller.
    }
    await this.prisma.transaction(async (transaction) => {
      const user = await this.users.findByIdForUpdate(payload.sub, transaction);
      if (user) await this.sessions.revoke(payload.sid, user.id, 'LOGOUT', transaction);
    });
  }

  async changePassword(actor: Actor, dto: ChangePasswordDto) {
    if (dto.newPassword !== dto.confirmPassword)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED', message: 'Invalid password data',
        fieldErrors: { confirmPassword: ['Passwords must match'] },
      });
    await this.prisma.transaction(async (transaction) => {
      const user = await this.users.findByIdForUpdate(actor.userId, transaction);
      if (!user || user.status !== 'ACTIVE' || !(await bcrypt.compare(dto.currentPassword, user.passwordHash)))
        throw new UnauthorizedException({ code: 'CURRENT_PASSWORD_INVALID', message: 'Current password is incorrect' });
      await this.users.updatePassword(user.id, await bcrypt.hash(dto.newPassword, 6), transaction);
      await this.passwordResetTokens.deleteUnusedForUser(user.id, transaction);
      await this.sessions.revokeAll(user.id, 'PASSWORD_CHANGED', transaction);
    });
  }

  async session(actor: Actor) {
    const user = await this.users.findById(actor.userId);
    if (!user) throw new UnauthorizedException();
    return userView(user);
  }
}
