import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: '12',
  email: 'google@example.com',
  passwordHash: null,
  googleSubject: 'google-subject',
  avatarUrl: null,
  fullName: 'Google Customer',
  phone: null,
  role: 'CUSTOMER' as const,
  status: 'ACTIVE' as const,
  lockedAt: null,
  lockReason: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  ...overrides,
});

describe('AuthService Google login', () => {
  const transaction = {};
  let service: AuthService;
  let users: {
    findByGoogleSubject: ReturnType<typeof vi.fn>;
    findByIdForUpdate: ReturnType<typeof vi.fn>;
    findByEmailForUpdate: ReturnType<typeof vi.fn>;
    createGoogleCustomer: ReturnType<typeof vi.fn>;
    linkGoogleSubject: ReturnType<typeof vi.fn>;
  };
  let sessions: {
    create: ReturnType<typeof vi.fn>;
    rotate: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.stubEnv('AUTH_ACCESS_SECRET', 'access-secret-for-unit-test');
    vi.stubEnv('AUTH_REFRESH_SECRET', 'refresh-secret-for-unit-test');
    const prisma = {
      transaction: vi.fn((work: (tx: typeof transaction) => unknown) =>
        work(transaction),
      ),
    };
    users = {
      findByGoogleSubject: vi.fn(),
      findByIdForUpdate: vi.fn(),
      findByEmailForUpdate: vi.fn(),
      createGoogleCustomer: vi.fn(),
      linkGoogleSubject: vi.fn(),
    };
    sessions = {
      create: vi.fn().mockResolvedValue({ id: '88' }),
      rotate: vi.fn().mockResolvedValue(undefined),
    };
    service = new AuthService(
      prisma as never,
      users as never,
      sessions as never,
      {} as never,
    );
  });

  it('creates a Customer with no password hash and issues the regular session', async () => {
    users.findByGoogleSubject.mockResolvedValue(null);
    users.findByEmailForUpdate.mockResolvedValue(null);
    users.createGoogleCustomer.mockResolvedValue(
      makeUser({ avatarUrl: 'https://lh3.googleusercontent.com/photo' }),
    );

    const result = await service.loginWithGoogle({
      subject: 'google-subject',
      email: 'google@example.com',
      fullName: 'Google Customer',
      avatarUrl: 'https://lh3.googleusercontent.com/photo',
    });

    expect(users.createGoogleCustomer).toHaveBeenCalledWith({
      email: 'google@example.com',
      fullName: 'Google Customer',
      googleSubject: 'google-subject',
      avatarUrl: 'https://lh3.googleusercontent.com/photo',
      transaction,
    });
    expect(result.user).toMatchObject({
      role: 'CUSTOMER',
      email: 'google@example.com',
    });
    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(sessions.create).toHaveBeenCalledOnce();
  });

  it('links a verified matching email without changing its role', async () => {
    users.findByGoogleSubject.mockResolvedValue(null);
    users.findByEmailForUpdate.mockResolvedValue(
      makeUser({
        role: 'ADMIN',
        googleSubject: null,
        passwordHash: 'hash',
        avatarUrl: 'https://example.com/existing-avatar.png',
      }),
    );
    users.linkGoogleSubject.mockResolvedValue(
      makeUser({
        role: 'ADMIN',
        passwordHash: 'hash',
        avatarUrl: 'https://example.com/existing-avatar.png',
      }),
    );

    const result = await service.loginWithGoogle({
      subject: 'google-subject',
      email: 'google@example.com',
      fullName: 'Google Customer',
      avatarUrl: 'https://lh3.googleusercontent.com/new-photo',
    });

    expect(result.user.role).toBe('ADMIN');
    expect(result.user.avatarUrl).toBe(
      'https://example.com/existing-avatar.png',
    );
    expect(users.linkGoogleSubject).toHaveBeenCalledWith(
      '12',
      'google-subject',
      transaction,
    );
  });

  it('refuses a locked account and does not create a session', async () => {
    users.findByGoogleSubject.mockResolvedValue(makeUser({ status: 'LOCKED' }));
    users.findByIdForUpdate.mockResolvedValue(makeUser({ status: 'LOCKED' }));

    await expect(
      service.loginWithGoogle({
        subject: 'google-subject',
        email: 'google@example.com',
        fullName: 'Google Customer',
        avatarUrl: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(sessions.create).not.toHaveBeenCalled();
  });
});
