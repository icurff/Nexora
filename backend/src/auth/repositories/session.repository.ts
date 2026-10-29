import { Injectable } from '@nestjs/common';
import { PrismaService, type TransactionClient } from '../../database/prisma.service.js';
import type { SessionRevokeReason } from '../entities/auth-session.entity.js';
import { toSession, toUser } from './mappers.js';

@Injectable()
export class SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, refreshTokenHash: string, expiresAt: Date, transaction: TransactionClient) {
    return toSession(await transaction.authSession.create({ data: {
      userId: BigInt(userId), refreshTokenHash, expiresAt, lastUsedAt: new Date(),
    } }));
  }

  async findOwnedForUpdate(id: string, userId: string, transaction: TransactionClient) {
    const rows = await transaction.$queryRaw<Array<{ id: bigint }>>`
      SELECT id FROM auth_sessions WHERE id = ${BigInt(id)} AND user_id = ${BigInt(userId)} FOR UPDATE
    `;
    if (!rows[0]) return null;
    const row = await transaction.authSession.findUnique({ where: { id: BigInt(id) } });
    return row ? toSession(row) : null;
  }

  async rotate(id: string, refreshVersion: number, refreshTokenHash: string, transaction: TransactionClient) {
    await transaction.authSession.update({ where: { id: BigInt(id) }, data: {
      refreshVersion, refreshTokenHash, lastUsedAt: new Date(),
    } });
  }

  async findActiveActor(id: string, userId: string) {
    const session = await this.prisma.authSession.findFirst({
      where: { id: BigInt(id), userId: BigInt(userId), revokedAt: null, expiresAt: { gt: new Date() }, user: { status: 'ACTIVE' } },
      include: { user: true },
    });
    if (!session) return null;
    return { userId: session.userId.toString(), sessionId: session.id.toString(), role: toUser(session.user).role };
  }

  async revoke(id: string, userId: string, reason: SessionRevokeReason, transaction: TransactionClient) {
    await transaction.authSession.updateMany({
      where: { id: BigInt(id), userId: BigInt(userId), revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  }

  async revokeAll(userId: string, reason: SessionRevokeReason, transaction: TransactionClient) {
    await transaction.authSession.updateMany({
      where: { userId: BigInt(userId), revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  }
}
