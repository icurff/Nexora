import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service.js';
import { GmailEmailProvider } from '../../notification/providers/gmail-email.provider.js';
import { SessionRepository } from '../repositories/session.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { PasswordResetTokenRepository } from '../repositories/password-reset-token.repository.js';

const genericRequestMessage =
  'Nếu email phù hợp với tài khoản, bạn sẽ nhận được liên kết đặt lại mật khẩu.';
const invalidTokenError = () =>
  new BadRequestException({
    code: 'INVALID_RESET_TOKEN',
    message: 'The password reset link is invalid or has expired.',
  });
const unavailableError = () =>
  new ServiceUnavailableException({
    code: 'PASSWORD_RESET_UNAVAILABLE',
    message: 'Password reset is temporarily unavailable.',
  });

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserRepository,
    private readonly tokens: PasswordResetTokenRepository,
    private readonly sessions: SessionRepository,
    private readonly emailProvider: GmailEmailProvider,
  ) {}

  async request(email: string) {
    if (!this.emailProvider.isConfigured()) {
      throw unavailableError();
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hash(token);
    const startedAt = Date.now();
    const issued = await this.prisma.transaction(async (transaction) => {
      const user = await this.users.findByEmailForUpdate(email, transaction);
      if (!user || user.role !== 'CUSTOMER' || user.status !== 'ACTIVE')
        return null;

      await this.tokens.deleteAllForUser(user.id, transaction);
      await this.tokens.create(
        {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
        transaction,
      );
      return { userId: user.id };
    });

    if (issued) {
      let sent = false;
      try {
        sent = await this.emailProvider.sendPasswordReset(email, token);
      } catch {
        this.logger.warn(
          'Password reset email delivery failed (provider_error)',
        );
      }
      if (!sent) {
        try {
          await this.prisma.transaction(async (transaction) => {
            await this.users.findByIdForUpdate(issued.userId, transaction);
            await this.tokens.deleteByHash(tokenHash, transaction);
          });
        } catch {
          this.logger.warn(
            'Unable to invalidate an unsent password reset token',
          );
        }
      }
    }

    const remainingWait = 3000 - (Date.now() - startedAt);
    if (remainingWait > 0)
      await new Promise((resolve) => setTimeout(resolve, remainingWait));
    return { message: genericRequestMessage };
  }

  async reset(token: string, newPassword: string, confirmPassword: string) {
    if (!this.emailProvider.isConfigured()) throw unavailableError();

    if (newPassword !== confirmPassword) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Invalid password data',
        fieldErrors: { confirmPassword: ['Passwords must match'] },
      });
    }

    const tokenHash = this.hash(token);
    const candidate = await this.tokens.findByHash(tokenHash);
    if (!candidate) throw invalidTokenError();

    const passwordHash = await bcrypt.hash(newPassword, 6);
    await this.prisma.transaction(async (transaction) => {
      // Lock order is user, token, then sessions, including concurrent token consumption.
      const user = await this.users.findByIdForUpdate(
        candidate.userId,
        transaction,
      );
      if (!user || user.role !== 'CUSTOMER' || user.status !== 'ACTIVE')
        throw invalidTokenError();

      const current = await this.tokens.findByHashForUpdate(
        tokenHash,
        transaction,
      );
      const now = new Date();
      if (
        !current ||
        current.userId !== user.id ||
        current.usedAt ||
        current.expiresAt <= now
      ) {
        throw invalidTokenError();
      }

      if (!(await this.tokens.consume(current.id, transaction)))
        throw invalidTokenError();
      await this.users.updatePassword(user.id, passwordHash, transaction);
      await this.tokens.deleteUnusedForUser(user.id, transaction);
      await this.sessions.revokeAll(user.id, 'PASSWORD_RESET', transaction);
    });
  }

  private hash(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
