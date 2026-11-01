import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import {
  PrismaService,
  type TransactionClient,
} from '../../database/prisma.service.js';
import { toUser } from './mappers.js';

export class EmailAlreadyExistsError extends Error {}

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createCustomer(data: {
    email: string;
    passwordHash: string;
    fullName: string;
  }) {
    try {
      return toUser(
        await this.prisma.user.create({
          data: { ...data, role: 'CUSTOMER', status: 'ACTIVE' },
        }),
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new EmailAlreadyExistsError();
      }
      throw error;
    }
  }

  async findById(id: string, transaction?: TransactionClient) {
    const row = await (transaction ?? this.prisma).user.findUnique({
      where: { id: BigInt(id) },
    });
    return row ? toUser(row) : null;
  }

  async listCustomers(input: {
    query?: string;
    status?: string;
    skip: number;
    take: number;
  }) {
    const where = {
      role: 'CUSTOMER',
      ...(input.status ? { status: input.status } : {}),
      ...(input.query
        ? {
            OR: [
              {
                fullName: {
                  contains: input.query,
                  mode: 'insensitive' as const,
                },
              },
              {
                email: { contains: input.query, mode: 'insensitive' as const },
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          role: true,
          status: true,
          lockedAt: true,
          lockReason: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: input.skip,
        take: input.take,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { rows, total };
  }

  async findCustomer(id: string) {
    return this.prisma.user.findFirst({
      where: { id: BigInt(id), role: 'CUSTOMER' },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        status: true,
        lockedAt: true,
        lockReason: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async updateProfile(
    id: string,
    data: { fullName?: string; phone?: string | null },
    transaction: TransactionClient,
  ) {
    return transaction.user.update({
      where: { id: BigInt(id) },
      data: { ...data, updatedAt: new Date() },
    });
  }

  async setCustomerStatus(
    id: string,
    status: 'ACTIVE' | 'LOCKED',
    lockReason: string | null,
    lockedAt: Date | null,
    transaction: TransactionClient,
  ) {
    return transaction.user.update({
      where: { id: BigInt(id) },
      data: { status, lockReason, lockedAt, updatedAt: new Date() },
    });
  }

  async findByEmailForUpdate(email: string, transaction: TransactionClient) {
    // Prisma has no row-lock API. Keep parameterized locking SQL in repositories.
    const rows = await transaction.$queryRaw<Array<{ id: bigint }>>`
      SELECT id FROM users WHERE email = ${email} FOR UPDATE
    `;
    return rows[0] ? this.findById(rows[0].id.toString(), transaction) : null;
  }

  async findByIdForUpdate(id: string, transaction: TransactionClient) {
    const rows = await transaction.$queryRaw<Array<{ id: bigint }>>`
      SELECT id FROM users WHERE id = ${BigInt(id)} FOR UPDATE
    `;
    return rows[0] ? this.findById(id, transaction) : null;
  }

  async updatePassword(
    id: string,
    passwordHash: string,
    transaction: TransactionClient,
  ) {
    await transaction.user.update({
      where: { id: BigInt(id) },
      data: { passwordHash, updatedAt: new Date() },
    });
  }
}
