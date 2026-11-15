import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';

export const TRACKING_VISITOR_COOKIE = 'nexora_visitor';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

export type TrackingContext = {
  visitorToken: string;
  visitorId: bigint;
  trackingSessionId: bigint;
  userId: string | null;
};

@Injectable()
export class TrackingIdentityService {
  constructor(private readonly prisma: PrismaService) {}

  private createToken() {
    return randomBytes(32).toString('base64url');
  }

  private isValidToken(token?: string): token is string {
    return !!token && /^[A-Za-z0-9_-]{43}$/.test(token);
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  visitorCookie(token: string) {
    const secure =
      process.env.COOKIE_SECURE === 'true' ? '; Secure' : '';

    return `${TRACKING_VISITOR_COOKIE}=${token}; Path=/api/v1; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure}`;
  }

  async resolve(
    currentToken?: string,
    userId?: string,
  ): Promise<TrackingContext> {
    const visitorToken = this.isValidToken(currentToken)
      ? currentToken
      : this.createToken();

    const tokenHash = this.hashToken(visitorToken);
    const now = new Date();
    const cutoff = new Date(now.getTime() - IDLE_TIMEOUT_MS);
    const requestedUserId = userId ? BigInt(userId) : null;

    const visitor = await this.prisma.visitor.upsert({
      where: { tokenHash },
      create: { tokenHash },
      update: { lastSeenAt: now },
    });

    const session = await this.prisma.$transaction(async (tx) => {
      // Serialize session creation for this visitor.
      await tx.$queryRaw`
        SELECT id FROM visitors
        WHERE id = ${visitor.id}
        FOR UPDATE
      `;

      // Close expired sessions.
      await tx.trackingSession.updateMany({
        where: {
          visitorId: visitor.id,
          endedAt: null,
          lastSeenAt: { lte: cutoff },
        },
        data: { endedAt: now },
      });

      const active = await tx.trackingSession.findFirst({
        where: {
          visitorId: visitor.id,
          endedAt: null,
        },
        orderBy: { lastSeenAt: 'desc' },
      });

      let current = active;

      if (active) {
        if (
          active.userId === null &&
          requestedUserId !== null
        ) {
          // Login: link the current Guest session once.
          current = await tx.trackingSession.update({
            where: { id: active.id },
            data: {
              userId: requestedUserId,
              linkedAt: now,
              lastSeenAt: now,
            },
          });
        } else if (active.userId !== requestedUserId) {
          // Different account or logout: never mix identities.
          await tx.trackingSession.update({
            where: { id: active.id },
            data: { endedAt: now },
          });
          current = null;
        } else {
          current = await tx.trackingSession.update({
            where: { id: active.id },
            data: { lastSeenAt: now },
          });
        }
      }

      if (!current) {
        current = await tx.trackingSession.create({
          data: {
            visitorId: visitor.id,
            userId: requestedUserId,
            linkedAt: requestedUserId ? now : null,
            startedAt: now,
            lastSeenAt: now,
          },
        });
      }

      await tx.visitor.update({
        where: { id: visitor.id },
        data: { lastSeenAt: now },
      });

      return current;
    });

    return {
      visitorToken,
      visitorId: visitor.id,
      trackingSessionId: session.id,
      userId: session.userId?.toString() ?? null,
    };
  }

  async linkAfterLogin(
    visitorToken: string | undefined,
    userId: string,
  ) {
    return this.resolve(visitorToken, userId);
  }

  async rotateAfterLogout(visitorToken?: string) {
    if (this.isValidToken(visitorToken)) {
      const tokenHash = this.hashToken(visitorToken);
      const visitor = await this.prisma.visitor.findUnique({
        where: { tokenHash },
      });

      if (visitor) {
        const now = new Date();

        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`
            SELECT id FROM visitors
            WHERE id = ${visitor.id}
            FOR UPDATE
          `;

          await tx.trackingSession.updateMany({
            where: {
              visitorId: visitor.id,
              endedAt: null,
            },
            data: { endedAt: now },
          });
        });
      }
    }

    // A new Guest identity after logout.
    const newToken = this.createToken();

    await this.prisma.visitor.create({
      data: {
        tokenHash: this.hashToken(newToken),
      },
    });

    return newToken;
  }
}
