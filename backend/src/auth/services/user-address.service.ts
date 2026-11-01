import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { UserAddress } from '../../generated/prisma/client.js';
import {
  PrismaService,
  type TransactionClient,
} from '../../database/prisma.service.js';
import type { AuthenticatedActor } from '../../shared/decorators/current-actor.decorator.js';
import type {
  UserAddressDto,
  UpdateUserAddressDto,
} from '../dto/user-address.dto.js';
import {
  UserAddressRepository,
  type AddressInput,
} from '../repositories/user-address.repository.js';

const view = (address: UserAddress) => {
  const { id, ...fields } = address;
  delete (fields as Partial<UserAddress>).userId;
  return {
    ...fields,
    id: id.toString(),
    createdAt: address.createdAt.toISOString(),
    updatedAt: address.updatedAt.toISOString(),
  };
};

@Injectable()
export class UserAddressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly addresses: UserAddressRepository,
  ) {}

  async list(actor: AuthenticatedActor) {
    return (await this.addresses.list(actor.userId)).map(view);
  }

  async create(actor: AuthenticatedActor, body: UserAddressDto) {
    const result = await this.prisma.transaction(async (tx) => {
      await this.lockOwner(actor.userId, tx);
      const isFirst = (await this.addresses.count(actor.userId, tx)) === 0;
      const makeDefault = isFirst || body.isDefault === true;
      if (makeDefault) await this.addresses.clearDefaults(actor.userId, tx);
      return this.addresses.create(
        actor.userId,
        this.addressFields(body),
        makeDefault,
        tx,
      );
    });
    return view(result);
  }

  async update(
    actor: AuthenticatedActor,
    id: string,
    body: UpdateUserAddressDto,
  ) {
    const result = await this.prisma.transaction(async (tx) => {
      await this.lockOwner(actor.userId, tx);
      const current = await this.getOwned(actor.userId, id, tx);
      const makeDefault = body.isDefault ?? current.isDefault;
      const fields = this.addressFields(body);
      if (makeDefault) {
        await this.addresses.clearDefaults(actor.userId, tx, id);
        return this.addresses.update(id, fields, true, tx);
      }
      if (current.isDefault) {
        const replacement = await this.addresses.oldest(actor.userId, tx, id);
        if (replacement)
          await this.addresses.update(replacement.id.toString(), {}, true, tx);
      }
      return this.addresses.update(id, fields, false, tx);
    });
    return view(result);
  }

  async remove(actor: AuthenticatedActor, id: string) {
    await this.prisma.transaction(async (tx) => {
      await this.lockOwner(actor.userId, tx);
      const current = await this.getOwned(actor.userId, id, tx);
      await this.addresses.delete(id, tx);
      if (current.isDefault) {
        const replacement = await this.addresses.oldest(actor.userId, tx);
        if (replacement)
          await this.addresses.update(replacement.id.toString(), {}, true, tx);
      }
    });
    return { deleted: true };
  }

  async makeDefault(actor: AuthenticatedActor, id: string) {
    const result = await this.prisma.transaction(async (tx) => {
      await this.lockOwner(actor.userId, tx);
      await this.getOwned(actor.userId, id, tx);
      return this.addresses.setDefault(actor.userId, id, tx);
    });
    return view(result);
  }

  private async lockOwner(userId: string, tx: TransactionClient) {
    if (!(await this.addresses.lockOwner(userId, tx)).length)
      throw new NotFoundException('Tài khoản không tồn tại');
  }

  private async getOwned(userId: string, id: string, tx: TransactionClient) {
    const address = await this.addresses.find(userId, id, tx);
    if (!address) throw new NotFoundException('Không tìm thấy địa chỉ');
    return address;
  }

  private addressFields(body: UserAddressDto): AddressInput;
  private addressFields(body: UpdateUserAddressDto): Partial<AddressInput>;
  private addressFields(
    body: UserAddressDto | UpdateUserAddressDto,
  ): AddressInput | Partial<AddressInput> {
    const fields = { ...body };
    delete fields.isDefault;
    return fields;
  }
}

export function parseAddressId(value: string): string {
  if (
    !/^\d+$/.test(value) ||
    BigInt(value) <= 0n ||
    BigInt(value) > 9_223_372_036_854_775_807n
  )
    throw new BadRequestException('Mã địa chỉ không hợp lệ');
  return value;
}
