import { Injectable, type OnModuleInit, type OnApplicationShutdown } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../generated/prisma/client.js';
import { createDatabaseOptions } from './config.js';

export type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  constructor() {
    super({ adapter: new PrismaPg(createDatabaseOptions()) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onApplicationShutdown() {
    await this.$disconnect();
  }

  transaction<T>(work: (transaction: TransactionClient) => Promise<T>): Promise<T> {
    return this.$transaction(work, { maxWait: 5000, timeout: 15000 });
  }
}
