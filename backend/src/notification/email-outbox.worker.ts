import {
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { GmailEmailProvider } from './providers/gmail-email.provider.js';

const RETRY_MS = [30_000, 120_000, 600_000, 1_800_000];
const LEASE_MS = 60_000;
const MAX_ATTEMPTS = 5;

@Injectable()
export class EmailOutboxWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(EmailOutboxWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: GmailEmailProvider,
  ) {}

  onModuleInit() {
    void this.processOne();
    this.timer = setInterval(() => void this.processOne(), 5_000);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async processOne() {
    if (this.running) return;
    this.running = true;
    try {
      await this.prisma.emailOutbox.updateMany({
        where: {
          status: 'PENDING',
          attempts: { gte: MAX_ATTEMPTS },
          OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }],
        },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          leaseToken: null,
          leaseUntil: null,
          lastErrorCode: 'attempt_limit_reached',
        },
      });
      await this.prisma.emailOutbox.deleteMany({
        where: {
          status: { in: ['SENT', 'FAILED'] },
          finishedAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        },
      });
      const token = randomUUID();
      const claimed = await this.prisma.$queryRaw<Array<{ id: bigint }>>`
        WITH candidate AS (
          SELECT id FROM email_outbox
          WHERE status = 'PENDING' AND available_at <= clock_timestamp()
            AND (lease_until IS NULL OR lease_until <= clock_timestamp())
            AND attempts < ${MAX_ATTEMPTS}
          ORDER BY available_at, id
          FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE email_outbox AS job
        SET lease_token = ${token}::uuid,
            lease_until = clock_timestamp() + (${LEASE_MS} * interval '1 millisecond'),
            attempts = attempts + 1
        FROM candidate WHERE job.id = candidate.id
        RETURNING job.id`;
      const id = claimed[0]?.id;
      if (!id) return;
      const job = await this.prisma.emailOutbox.findUnique({ where: { id } });
      if (!job) return;
      const payload = job.payload as unknown as Parameters<
        GmailEmailProvider['sendOrderStatus']
      >[1];
      const configured = this.email.isConfigured();
      let result: Awaited<ReturnType<GmailEmailProvider['sendOrderStatus']>> = {
        sent: false,
        retryable: true,
        errorCode: 'delivery_timeout',
      };
      if (configured) {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          result = await Promise.race([
            this.email.sendOrderStatus(job.recipientEmail, payload),
            new Promise<typeof result>((resolve) => {
              timeout = setTimeout(
                () =>
                  resolve({
                    sent: false,
                    retryable: true,
                    errorCode: 'delivery_timeout',
                  }),
                30_000,
              );
            }),
          ]);
        } finally {
          if (timeout) clearTimeout(timeout);
        }
      }
      if (result.sent) {
        await this.prisma.emailOutbox.updateMany({
          where: { id, leaseToken: token },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            finishedAt: new Date(),
            leaseToken: null,
            leaseUntil: null,
            lastErrorCode: null,
          },
        });
      } else {
        const terminal =
          !configured || !result.retryable || job.attempts >= MAX_ATTEMPTS;
        const delay = RETRY_MS[job.attempts - 1] ?? RETRY_MS.at(-1)!;
        await this.prisma.emailOutbox.updateMany({
          where: { id, leaseToken: token },
          data: {
            status: terminal ? 'FAILED' : 'PENDING',
            availableAt: new Date(Date.now() + delay),
            finishedAt: terminal ? new Date() : null,
            leaseToken: null,
            leaseUntil: null,
            lastErrorCode: configured
              ? result.errorCode
              : 'provider_not_configured',
          },
        });
        this.logger.warn(
          `Email job ${id.toString()} delivery ${terminal ? 'failed' : 'scheduled for retry'}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Email worker cycle failed (${error instanceof Error ? error.name : 'unknown'})`,
      );
    } finally {
      this.running = false;
    }
  }
}
