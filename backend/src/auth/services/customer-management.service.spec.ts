import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LockCustomerDto } from '../dto/customer-management.dto.js';
import { UpdateProfileDto } from '../dto/update-profile.dto.js';
import { CustomerManagementService } from './customer-management.service.js';

const customer = (overrides: Record<string, unknown> = {}) => ({
  id: '12',
  email: 'customer@example.com',
  fullName: 'Nguyễn An',
  phone: null,
  role: 'CUSTOMER',
  status: 'ACTIVE',
  lockedAt: null,
  lockReason: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  ...overrides,
});

describe('CustomerManagementService', () => {
  const tx = { authSession: { findFirst: vi.fn() } };
  const prisma = {
    transaction: vi.fn((work: (transaction: typeof tx) => unknown) => work(tx)),
  };
  const users = {
    listCustomers: vi.fn(),
    findCustomer: vi.fn(),
    findById: vi.fn(),
    findByIdForUpdate: vi.fn(),
    setCustomerStatus: vi.fn(),
    updateProfile: vi.fn(),
  };
  const sessions = { revokeAll: vi.fn() };
  const service = new CustomerManagementService(
    prisma as never,
    users as never,
    sessions as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.transaction.mockImplementation((work) => work(tx));
  });

  it('returns paginated customers without sensitive fields', async () => {
    users.listCustomers.mockResolvedValue({
      rows: [{ ...customer(), id: 12n }],
      total: 1,
    });
    await expect(service.list('an', 'ACTIVE', 1, 20)).resolves.toMatchObject({
      total: 1,
      page: 1,
      pageSize: 20,
      items: [{ id: '12', email: 'customer@example.com', role: 'CUSTOMER' }],
    });
    expect(users.listCustomers).toHaveBeenCalledWith({
      query: 'an',
      status: 'ACTIVE',
      skip: 0,
      take: 20,
    });
  });

  it('locks only Customers and revokes all active sessions in the same transaction', async () => {
    users.findByIdForUpdate.mockResolvedValue(customer());
    users.setCustomerStatus.mockResolvedValue({
      ...customer(),
      id: 12n,
      status: 'LOCKED',
      lockReason: 'Vi phạm chính sách',
    });
    const result = await service.lock('12', 'Vi phạm chính sách');
    expect(result).toMatchObject({
      status: 'LOCKED',
      lockReason: 'Vi phạm chính sách',
    });
    expect(sessions.revokeAll).toHaveBeenCalledWith('12', 'ACCOUNT_LOCKED', tx);

    users.findByIdForUpdate.mockResolvedValue(customer({ role: 'ADMIN' }));
    await expect(service.lock('12', 'Lý do')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('does not restore sessions when unlocking and treats repeated unlock as idempotent', async () => {
    users.findByIdForUpdate.mockResolvedValue(
      customer({ status: 'LOCKED', lockedAt: new Date(), lockReason: 'Lý do' }),
    );
    users.setCustomerStatus.mockResolvedValue({ ...customer(), id: 12n });
    await service.unlock('12');
    expect(users.setCustomerStatus).toHaveBeenCalledWith(
      '12',
      'ACTIVE',
      null,
      null,
      tx,
    );
    expect(sessions.revokeAll).not.toHaveBeenCalled();

    users.findByIdForUpdate.mockResolvedValue(customer());
    await service.unlock('12');
    expect(users.setCustomerStatus).toHaveBeenCalledTimes(1);
  });

  it('updates only the authenticated profile and rejects an empty patch', async () => {
    const actor = { userId: '12', sessionId: '33', role: 'CUSTOMER' as const };
    await expect(service.updateProfile(actor, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    users.findByIdForUpdate.mockResolvedValue(customer());
    tx.authSession.findFirst.mockResolvedValue({ id: 33n });
    users.updateProfile.mockResolvedValue({
      ...customer(),
      fullName: 'An Nguyễn',
    });
    await expect(
      service.updateProfile(actor, { fullName: 'An Nguyễn' }),
    ).resolves.toMatchObject({ fullName: 'An Nguyễn' });
    expect(users.updateProfile).toHaveBeenCalledWith(
      '12',
      { fullName: 'An Nguyễn' },
      tx,
    );
  });

  it('validates profile fields and trims the required lock reason', async () => {
    const invalidProfile = plainToInstance(UpdateProfileDto, {
      fullName: null,
      phone: '123',
    });
    expect(await validate(invalidProfile)).toHaveLength(2);
    const validProfile = plainToInstance(UpdateProfileDto, {
      fullName: '  An  ',
      phone: ' +84 1234567890 ',
    });
    expect(await validate(validProfile)).toHaveLength(0);
    expect(validProfile).toMatchObject({
      fullName: 'An',
      phone: '+841234567890',
    });
    const lock = plainToInstance(LockCustomerDto, {
      reason: '  Terms violation  ',
    });
    expect(await validate(lock)).toHaveLength(0);
    expect(lock.reason).toBe('Terms violation');
  });
});
