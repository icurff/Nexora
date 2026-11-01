import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedActor } from '../../shared/decorators/current-actor.decorator.js';
import { PrismaService } from '../../database/prisma.service.js';
import { SessionRepository } from '../repositories/session.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import type { UpdateProfileDto } from '../dto/update-profile.dto.js';

const customerView = (user: {
  id: bigint | string;
  email: string;
  fullName: string;
  phone: string | null;
  role?: string;
  status: string;
  lockedAt: Date | null;
  lockReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: user.id.toString(),
  email: user.email,
  fullName: user.fullName,
  phone: user.phone,
  role: user.role === 'ADMIN' ? ('ADMIN' as const) : ('CUSTOMER' as const),
  status: user.status,
  lockedAt: user.lockedAt?.toISOString() ?? null,
  lockReason: user.lockReason,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
});

@Injectable()
export class CustomerManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
  ) {}

  async list(
    query: string | undefined,
    status: 'ACTIVE' | 'LOCKED' | undefined,
    page: number,
    pageSize: number,
  ) {
    const { rows, total } = await this.users.listCustomers({
      query,
      status,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items: rows.map(customerView), total, page, pageSize };
  }

  async getCustomer(id: string) {
    const user = await this.users.findCustomer(id);
    if (!user) throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND' });
    return customerView(user);
  }

  async lock(id: string, reason: string) {
    return this.prisma.transaction(async (tx) => {
      const user = await this.users.findByIdForUpdate(id, tx);
      if (!user || user.role !== 'CUSTOMER')
        throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND' });
      if (user.status === 'LOCKED')
        return customerView({ ...user, id: BigInt(user.id) });
      const now = new Date();
      const updated = await this.users.setCustomerStatus(
        id,
        'LOCKED',
        reason,
        now,
        tx,
      );
      await this.sessions.revokeAll(id, 'ACCOUNT_LOCKED', tx);
      return customerView(updated);
    });
  }

  async unlock(id: string) {
    return this.prisma.transaction(async (tx) => {
      const user = await this.users.findByIdForUpdate(id, tx);
      if (!user || user.role !== 'CUSTOMER')
        throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND' });
      if (user.status === 'ACTIVE') return customerView(user);
      const updated = await this.users.setCustomerStatus(
        id,
        'ACTIVE',
        null,
        null,
        tx,
      );
      return customerView(updated);
    });
  }

  async profile(actor: AuthenticatedActor) {
    const user = await this.users.findById(actor.userId);
    if (!user) throw new NotFoundException();
    return customerView({ ...user, id: BigInt(user.id) });
  }

  async updateProfile(actor: AuthenticatedActor, body: UpdateProfileDto) {
    if (body.fullName === undefined && body.phone === undefined)
      throw new BadRequestException({ code: 'EMPTY_PROFILE_UPDATE' });
    return this.prisma.transaction(async (tx) => {
      const user = await this.users.findByIdForUpdate(actor.userId, tx);
      if (!user || user.status !== 'ACTIVE') throw new NotFoundException();
      const session = await tx.authSession.findFirst({
        where: {
          id: BigInt(actor.sessionId),
          userId: BigInt(actor.userId),
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (!session) throw new NotFoundException();
      const updated = await this.users.updateProfile(
        actor.userId,
        {
          ...(body.fullName === undefined ? {} : { fullName: body.fullName }),
          ...(body.phone === undefined ? {} : { phone: body.phone || null }),
        },
        tx,
      );
      return customerView(updated);
    });
  }
}
