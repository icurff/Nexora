import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserAddressService } from './user-address.service.js';
import type { UserAddressRepository } from '../repositories/user-address.repository.js';
import type { PrismaService } from '../../database/prisma.service.js';

const actor = { userId: '7', sessionId: 'session', role: 'CUSTOMER' as const };
const input = {
  recipientName: '  Nguyễn An  ',
  recipientPhone: '0901234567',
  provinceName: 'Thành phố Hà Nội',
  wardName: 'Phường Ba Đình',
  addressLine: 'Số 1 phố A',
};
const row = (id: bigint, isDefault: boolean) => ({
  id,
  userId: 7n,
  ...input,
  isDefault,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
});

describe('UserAddressService', () => {
  let service: UserAddressService;
  let repository: Record<string, ReturnType<typeof vi.fn>>;
  let transaction: { $queryRaw: ReturnType<typeof vi.fn> };
  let prisma: { transaction: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    transaction = { $queryRaw: vi.fn().mockResolvedValue([{ id: 7n }]) };
    prisma = {
      transaction: vi.fn((work: (tx: unknown) => unknown) => work(transaction)),
    };
    repository = {
      list: vi.fn(),
      lockOwner: vi.fn().mockResolvedValue([{ id: 7n }]),
      find: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      clearDefaults: vi.fn(),
      delete: vi.fn(),
      oldest: vi.fn(),
      setDefault: vi.fn(),
    };
    service = new UserAddressService(
      prisma as unknown as PrismaService,
      repository as unknown as UserAddressRepository,
    );
  });

  it('makes the first address default and returns IDs as strings', async () => {
    repository.count.mockResolvedValue(0);
    repository.create.mockResolvedValue(row(19n, true));

    const result = await service.create(actor, input);

    expect(repository.lockOwner).toHaveBeenCalledWith('7', transaction);
    expect(repository.create).toHaveBeenCalledWith(
      '7',
      input,
      true,
      transaction,
    );
    expect(result).toMatchObject({
      id: '19',
      isDefault: true,
      provinceName: input.provinceName,
    });
    expect(result).not.toHaveProperty('userId');
  });

  it('reassigns the default to the oldest remaining address when deleting it', async () => {
    repository.find.mockResolvedValue(row(19n, true));
    repository.delete.mockResolvedValue(row(19n, true));
    repository.oldest.mockResolvedValue(row(12n, false));

    await service.remove(actor, '19');

    expect(repository.delete).toHaveBeenCalledWith('19', transaction);
    expect(repository.oldest).toHaveBeenCalledWith('7', transaction);
    expect(repository.update).toHaveBeenCalledWith('12', {}, true, transaction);
  });

  it('does not update an address owned by another user', async () => {
    repository.find.mockResolvedValue(null);

    await expect(service.makeDefault(actor, '19')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.setDefault).not.toHaveBeenCalled();
  });

  it('clears the previous default before choosing another one', async () => {
    repository.find.mockResolvedValue(row(19n, false));
    repository.setDefault.mockResolvedValue(row(19n, true));

    await service.makeDefault(actor, '19');

    expect(repository.setDefault).toHaveBeenCalledWith('7', '19', transaction);
  });
});
