import { randomBytes } from 'node:crypto';
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import bcrypt from 'bcrypt';
import { SignJWT, jwtVerify } from 'jose';
import type { User } from '../database/entities/user.entity.js';
import type { AuthSession } from '../database/entities/auth-session.entity.js';
import { hashRefreshToken } from '../database/crypto.js';
import type { RegisterDto, LoginDto, ChangePasswordDto } from './auth.dto.js';

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
  private readonly internalKey: string;
  private readonly secureCookie: boolean;
  constructor(private readonly db: DataSource) {
    this.accessKey = this.secret('AUTH_ACCESS_SECRET');
    this.refreshKey = this.secret('AUTH_REFRESH_SECRET');
    this.internalKey = process.env.AUTH_INTERNAL_TOKEN ?? '';
    if (this.internalKey.length < 32)
      throw new Error(
        'AUTH_INTERNAL_TOKEN must contain at least 32 characters',
      );
    this.secureCookie = process.env.COOKIE_SECURE === 'true';
  }
  private secret(name: string): Uint8Array {
    const v = process.env[name] ?? '';
    if (v.length < 32)
      throw new Error(`${name} must contain at least 32 characters`);
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
      typeof payload.sid !== 'string'
    )
      throw new UnauthorizedException();
    return payload;
  }
  async register(dto: RegisterDto) {
    const fullName = dto.fullName.trim();
    const email = dto.email.trim().toLowerCase();
    if (
      !fullName ||
      Buffer.byteLength(dto.password, 'utf8') > 72 ||
      dto.password !== dto.confirmPassword
    )
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Invalid registration data',
        fieldErrors: { confirmPassword: ['Passwords must match'] },
      });
    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      const rows = (await this.db.query(
        `INSERT INTO users (email,password_hash,full_name,role,status) VALUES ($1,$2,$3,'CUSTOMER','ACTIVE') RETURNING id,email,password_hash AS "passwordHash",full_name AS "fullName",phone,role,status,locked_at AS "lockedAt",lock_reason AS "lockReason",created_at AS "createdAt",updated_at AS "updatedAt"`,
        [email, passwordHash, fullName],
      )) as unknown as User[];
      return userView(rows[0]);
    } catch (e) {
      const pgError = e as { code?: string; driverError?: { code?: string } };
      if (pgError.code === '23505' || pgError.driverError?.code === '23505')
        throw new ConflictException({
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'Email is already registered',
          fieldErrors: { email: ['Email is already registered'] },
        });
      throw e;
    }
  }
  async login(dto: LoginDto) {
    return this.db.transaction(async (m) => {
      const rows = (await m.query(
        `SELECT id,email,password_hash AS "passwordHash",full_name AS "fullName",phone,role,status,locked_at AS "lockedAt",lock_reason AS "lockReason",created_at AS "createdAt",updated_at AS "updatedAt" FROM users WHERE email=$1 FOR UPDATE`,
        [dto.email],
      )) as unknown as User[];
      const user = rows[0];
      if (!user || !(await bcrypt.compare(dto.password, user.passwordHash)))
        throw new UnauthorizedException({
          code: 'INVALID_CREDENTIALS',
          message: 'Email or password is incorrect',
        });
      if (user.status !== 'ACTIVE')
        throw new ForbiddenException({
          code: 'ACCOUNT_LOCKED',
          message: 'Account is locked',
        });
      const sessionRows = (await m.query(
        `INSERT INTO auth_sessions (user_id,refresh_token_hash,refresh_version,expires_at,last_used_at) VALUES ($1,$2,0,NOW()+INTERVAL '7 days',NOW()) RETURNING id`,
        [user.id, randomBytes(32).toString('hex')],
      )) as unknown as Array<{ id: string }>;
      const sid = String(sessionRows[0].id);
      const refreshToken = await this.jwt(user.id, sid, 'refresh', 0, '7d');
      await m.query(
        'UPDATE auth_sessions SET refresh_token_hash=$1 WHERE id=$2',
        [hashRefreshToken(refreshToken), sid],
      );
      return {
        accessToken: await this.jwt(user.id, sid, 'access'),
        refreshToken,
        user: userView(user),
      };
    });
  }
  async refresh(token?: string) {
    if (!token) throw new UnauthorizedException();
    let p;
    try {
      p = await this.verify(token, 'refresh');
    } catch {
      throw new UnauthorizedException();
    }
    const result = await this.db.transaction(async (m) => {
      await m.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [p.sub]);
      const rows = (await m.query(
        `SELECT s.id,s.user_id AS "userId",s.refresh_token_hash AS "refreshTokenHash",s.refresh_version AS "refreshVersion",s.expires_at AS "expiresAt",s.revoked_at AS "revokedAt",u.email,u.full_name AS "fullName",u.phone,u.role,u.status,u.created_at AS "createdAt",u.updated_at AS "updatedAt" FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.user_id=$2 FOR UPDATE OF s`,
        [p.sid, p.sub],
      )) as unknown as Array<AuthSession & User>;
      const s = rows[0] as (AuthSession & User) | undefined;
      if (!s || s.userId !== p.sub || s.status !== 'ACTIVE')
        throw new UnauthorizedException();
      const valid =
        s.refreshTokenHash === hashRefreshToken(token) &&
        Number(s.refreshVersion) === p.version &&
        !s.revokedAt &&
        new Date(s.expiresAt) > new Date();
      if (!valid) {
        const replay = Boolean(
          s &&
          !s.revokedAt &&
          p.version !== undefined &&
          Number(s.refreshVersion) > Number(p.version),
        );
        if (replay)
          await m.query(
            `UPDATE auth_sessions SET revoked_at=NOW(),revoke_reason='TOKEN_REUSE' WHERE id=$1 AND revoked_at IS NULL`,
            [s.id],
          );
        return null;
      }
      const version = Number(s.refreshVersion) + 1;
      const next = await this.jwt(
        s.userId,
        s.id,
        'refresh',
        version,
        Math.max(
          1,
          Math.floor((new Date(s.expiresAt).getTime() - Date.now()) / 1000),
        ) + 's',
      );
      await m.query(
        'UPDATE auth_sessions SET refresh_version=$1,refresh_token_hash=$2,last_used_at=NOW() WHERE id=$3',
        [version, hashRefreshToken(next), s.id],
      );
      return {
        accessToken: await this.jwt(s.userId, s.id, 'access'),
        refreshToken: next,
        user: userView(s),
      };
    });
    if (!result) throw new UnauthorizedException();
    return result;
  }
  async authenticate(token?: string): Promise<Actor> {
    if (!token) throw new UnauthorizedException();
    let p;
    try {
      p = await this.verify(token, 'access');
    } catch {
      throw new UnauthorizedException();
    }
    const rows = (await this.db.query(
      `SELECT u.id AS "userId",s.id AS "sessionId",u.role FROM users u JOIN auth_sessions s ON s.user_id=u.id WHERE u.id=$1 AND s.id=$2 AND u.status='ACTIVE' AND s.revoked_at IS NULL AND s.expires_at>NOW()`,
      [p.sub, p.sid],
    )) as unknown as Array<{
      userId: string;
      sessionId: string;
      role: User['role'];
    }>;
    if (!rows[0]) throw new UnauthorizedException();
    return {
      userId: String(rows[0].userId),
      sessionId: String(rows[0].sessionId),
      role: rows[0].role,
    };
  }
  async logout(token?: string) {
    if (token) {
      let p;
      try {
        p = await this.verify(token, 'refresh', true);
      } catch {
        return; // Invalid or forged cookies are cleared by the controller.
      }
      await this.db.transaction(async (manager) => {
        await manager.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [
          p.sub,
        ]);
        await manager.query(
          `UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,NOW()),revoke_reason=COALESCE(revoke_reason,'LOGOUT') WHERE id=$1 AND user_id=$2`,
          [p.sid, p.sub],
        );
      });
    }
  }
  async changePassword(actor: Actor, dto: ChangePasswordDto) {
    if (
      dto.newPassword !== dto.confirmPassword ||
      Buffer.byteLength(dto.newPassword, 'utf8') > 72
    )
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Invalid password data',
        fieldErrors: { confirmPassword: ['Passwords must match'] },
      });
    await this.db.transaction(async (m) => {
      const rows = (await m.query(
        `SELECT id,email,password_hash AS "passwordHash",full_name AS "fullName",phone,role,status,created_at AS "createdAt",updated_at AS "updatedAt" FROM users WHERE id=$1 FOR UPDATE`,
        [actor.userId],
      )) as unknown as User[];
      const user = rows[0] as User | undefined;
      if (
        !user ||
        user.status !== 'ACTIVE' ||
        !(await bcrypt.compare(dto.currentPassword, user.passwordHash))
      )
        throw new UnauthorizedException({
          code: 'CURRENT_PASSWORD_INVALID',
          message: 'Current password is incorrect',
        });
      const nextHash = await bcrypt.hash(dto.newPassword, 12);
      await m.query(
        'UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2',
        [nextHash, actor.userId],
      );
      await m.query(
        `UPDATE auth_sessions SET revoked_at=NOW(),revoke_reason='PASSWORD_CHANGED' WHERE user_id=$1 AND revoked_at IS NULL`,
        [actor.userId],
      );
    });
  }
  async introspect(token: string, credential: string) {
    if (credential !== this.internalKey) throw new ForbiddenException();
    try {
      const actor = await this.authenticate(token);
      return { active: true, ...actor };
    } catch (error) {
      if (error instanceof UnauthorizedException) return { active: false };
      throw error;
    }
  }
  async session(actor: Actor) {
    const rows = (await this.db.query(
      `SELECT id,email,full_name AS "fullName",phone,role,status,created_at AS "createdAt",updated_at AS "updatedAt" FROM users WHERE id=$1`,
      [actor.userId],
    )) as unknown as User[];
    if (!rows[0]) throw new UnauthorizedException();
    return userView(rows[0]);
  }
}
