import { Injectable } from '@nestjs/common';
import {
  PrismaService,
  type TransactionClient,
} from '../../database/prisma.service.js';
import type { PasswordResetToken } from '../entities/password-reset-token.entity.js';

function toToken(row: {
  id: bigint;
  userId: bigint;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}): PasswordResetToken {
  return { ...row, id: row.id.toString(), userId: row.userId.toString() };
}

@Injectable()
export class PasswordResetTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async deleteUnusedForUser(userId: string, transaction: TransactionClient) {
    await transaction.passwordResetToken.deleteMany({
      where: { userId: BigInt(userId), usedAt: null },
    });
  }

  async deleteAllForUser(userId: string, transaction: TransactionClient) {
    await transaction.passwordResetToken.deleteMany({
      where: { userId: BigInt(userId) },
    });
  }

  async deleteByHash(tokenHash: string, transaction: TransactionClient) {
    await transaction.passwordResetToken.deleteMany({
      where: { tokenHash, usedAt: null },
    });
  }

  async create(
    data: { userId: string; tokenHash: string; expiresAt: Date },
    transaction: TransactionClient,
  ) {
    return toToken(
      await transaction.passwordResetToken.create({
        data: {
          userId: BigInt(data.userId),
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
        },
      }),
    );
  }

  async findByHash(tokenHash: string, transaction?: TransactionClient) {
    const row = await (
      transaction ?? this.prisma
    ).passwordResetToken.findUnique({ where: { tokenHash } });
    return row ? toToken(row) : null;
  }

  async findByHashForUpdate(tokenHash: string, transaction: TransactionClient) {
    const rows = await transaction.$queryRaw<Array<{ id: bigint }>>`
      SELECT id FROM password_reset_tokens WHERE token_hash = ${tokenHash} FOR UPDATE
    `;
    if (!rows[0]) return null;
    const row = await transaction.passwordResetToken.findUnique({
      where: { id: rows[0].id },
    });
    return row ? toToken(row) : null;
  }

  async consume(id: string, transaction: TransactionClient) {
    const result = await transaction.passwordResetToken.updateMany({
      where: { id: BigInt(id), usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    return result.count === 1;
  }
}
