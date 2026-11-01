import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service.js';
import { UserAddressRepository } from '../repositories/user-address.repository.js';
import { UserAddressService } from './user-address.service.js';

const enabled = process.env.RUN_ADDRESS_DB_TESTS === '1';
const actor = {
  userId: '',
  sessionId: 'address-integration',
  role: 'CUSTOMER' as const,
};
const address = {
  recipientName: 'Address integration',
  recipientPhone: '0901234567',
  provinceName: 'Thành phố Hà Nội',
  wardName: 'Phường Ba Đình',
  addressLine: 'Integration test address',
};

describe.skipIf(!enabled)('UserAddressService PostgreSQL integration', () => {
  const prisma = new PrismaService();
  const service = new UserAddressService(
    prisma,
    new UserAddressRepository(prisma),
  );

  beforeAll(async () => {
    await prisma.$connect();
    const user = await prisma.user.create({
      data: {
        email: `address-integration-${crypto.randomUUID()}@example.invalid`,
        passwordHash: 'unused-in-integration-test',
        fullName: 'Address integration',
        role: 'CUSTOMER',
        status: 'ACTIVE',
      },
    });
    actor.userId = user.id.toString();
  });

  afterAll(async () => {
    if (actor.userId) {
      await prisma.userAddress.deleteMany({
        where: { userId: BigInt(actor.userId) },
      });
      await prisma.user.delete({ where: { id: BigInt(actor.userId) } });
    }
    await prisma.$disconnect();
  });

  it('serializes simultaneous first saves and default changes', async () => {
    const [first, second] = await Promise.all([
      service.create(actor, address),
      service.create(actor, { ...address, recipientName: 'Second' }),
    ]);
    let rows = await prisma.userAddress.findMany({
      where: { userId: BigInt(actor.userId) },
    });
    expect(rows).toHaveLength(2);
    expect(rows.filter(({ isDefault }) => isDefault)).toHaveLength(1);

    await Promise.all([
      service.makeDefault(actor, first.id),
      service.makeDefault(actor, second.id),
    ]);
    rows = await prisma.userAddress.findMany({
      where: { userId: BigInt(actor.userId) },
    });
    expect(rows.filter(({ isDefault }) => isDefault)).toHaveLength(1);
  });

  it('chooses the oldest remaining address after deleting the default', async () => {
    const rows = await service.list(actor);
    const defaultRow = rows.find(({ isDefault }) => isDefault)!;
    const expected = rows.find(({ id }) => id !== defaultRow.id)!;

    await service.remove(actor, defaultRow.id);

    await expect(service.list(actor)).resolves.toMatchObject([
      { id: expected.id, isDefault: true },
    ]);
  });
});
