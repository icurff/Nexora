import { Injectable } from '@nestjs/common';
import type { UserAddress } from '../../generated/prisma/client.js';
import {
  PrismaService,
  type TransactionClient,
} from '../../database/prisma.service.js';

export type AddressInput = Pick<
  UserAddress,
  | 'recipientName'
  | 'recipientPhone'
  | 'provinceName'
  | 'wardName'
  | 'addressLine'
>;

@Injectable()
export class UserAddressRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.userAddress.findMany({
      where: { userId: BigInt(userId) },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  lockOwner(userId: string, tx: TransactionClient) {
    return tx.$queryRaw<Array<{ id: bigint }>>`
      SELECT id FROM users WHERE id = ${BigInt(userId)} FOR UPDATE
    `;
  }

  find(userId: string, addressId: string, tx: TransactionClient) {
    return tx.userAddress.findFirst({
      where: { id: BigInt(addressId), userId: BigInt(userId) },
    });
  }

  count(userId: string, tx: TransactionClient) {
    return tx.userAddress.count({ where: { userId: BigInt(userId) } });
  }

  create(
    userId: string,
    data: AddressInput,
    isDefault: boolean,
    tx: TransactionClient,
  ) {
    return tx.userAddress.create({
      data: { ...data, userId: BigInt(userId), isDefault },
    });
  }

  update(
    addressId: string,
    data: Partial<AddressInput>,
    isDefault: boolean,
    tx: TransactionClient,
  ) {
    return tx.userAddress.update({
      where: { id: BigInt(addressId) },
      data: { ...data, isDefault },
    });
  }

  async clearDefaults(
    userId: string,
    tx: TransactionClient,
    exceptId?: string,
  ) {
    await tx.userAddress.updateMany({
      where: {
        userId: BigInt(userId),
        ...(exceptId ? { id: { not: BigInt(exceptId) } } : {}),
        isDefault: true,
      },
      data: { isDefault: false },
    });
  }

  async delete(addressId: string, tx: TransactionClient) {
    return tx.userAddress.delete({ where: { id: BigInt(addressId) } });
  }

  oldest(userId: string, tx: TransactionClient, exceptId?: string) {
    return tx.userAddress.findFirst({
      where: {
        userId: BigInt(userId),
        ...(exceptId ? { id: { not: BigInt(exceptId) } } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async setDefault(userId: string, addressId: string, tx: TransactionClient) {
    await this.clearDefaults(userId, tx);
    return this.update(addressId, {}, true, tx);
  }
}
