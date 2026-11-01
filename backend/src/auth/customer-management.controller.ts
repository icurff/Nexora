import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentActor,
  type AuthenticatedActor,
} from '../shared/decorators/current-actor.decorator.js';
import { Roles } from '../shared/decorators/roles.decorator.js';
import { AuthGuard } from '../shared/guards/auth.guard.js';
import { RolesGuard } from '../shared/guards/roles.guard.js';
import { CustomerManagementService } from './services/customer-management.service.js';
import {
  ListCustomersDto,
  LockCustomerDto,
} from './dto/customer-management.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class CustomerManagementController {
  constructor(private readonly customers: CustomerManagementService) {}

  @Get('me')
  @Roles('CUSTOMER', 'ADMIN')
  profile(@CurrentActor() actor: AuthenticatedActor) {
    return this.customers.profile(actor);
  }

  @Patch('me')
  @Roles('CUSTOMER')
  updateProfile(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() body: UpdateProfileDto,
  ) {
    return this.customers.updateProfile(actor, body);
  }

  @Get('admin/customers')
  @Roles('ADMIN')
  list(@Query() query: ListCustomersDto) {
    return this.customers.list(
      query.q,
      query.status,
      query.page,
      query.pageSize,
    );
  }

  @Get('admin/customers/:id')
  @Roles('ADMIN')
  get(@Param('id') id: string) {
    return this.customers.getCustomer(parseCustomerId(id));
  }

  @Post('admin/customers/:id/lock')
  @Roles('ADMIN')
  lock(@Param('id') id: string, @Body() body: LockCustomerDto) {
    return this.customers.lock(parseCustomerId(id), body.reason);
  }

  @Post('admin/customers/:id/unlock')
  @Roles('ADMIN')
  unlock(@Param('id') id: string) {
    return this.customers.unlock(parseCustomerId(id));
  }
}

function parseCustomerId(value: string): string {
  if (
    !/^[1-9]\d{0,18}$/.test(value) ||
    BigInt(value) > 9_223_372_036_854_775_807n
  ) {
    throw new BadRequestException({ code: 'INVALID_CUSTOMER_ID' });
  }
  return value;
}
