import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentActor,
  type AuthenticatedActor,
} from '../shared/decorators/current-actor.decorator.js';
import { Roles } from '../shared/decorators/roles.decorator.js';
import { AuthGuard } from '../shared/guards/auth.guard.js';
import { RolesGuard } from '../shared/guards/roles.guard.js';
import {
  UserAddressDto,
  UpdateUserAddressDto,
} from './dto/user-address.dto.js';
import {
  parseAddressId,
  UserAddressService,
} from './services/user-address.service.js';

@Controller('me/addresses')
@UseGuards(AuthGuard, RolesGuard)
@Roles('CUSTOMER')
export class UserAddressController {
  constructor(private readonly addresses: UserAddressService) {}

  @Get()
  list(@CurrentActor() actor: AuthenticatedActor) {
    return this.addresses.list(actor);
  }

  @Post()
  create(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() body: UserAddressDto,
  ) {
    return this.addresses.create(actor, body);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id') id: string,
    @Body() body: UpdateUserAddressDto,
  ) {
    return this.addresses.update(actor, parseAddressId(id), body);
  }

  @Delete(':id')
  remove(@CurrentActor() actor: AuthenticatedActor, @Param('id') id: string) {
    return this.addresses.remove(actor, parseAddressId(id));
  }

  @Put(':id/default')
  makeDefault(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id') id: string,
  ) {
    return this.addresses.makeDefault(actor, parseAddressId(id));
  }
}
