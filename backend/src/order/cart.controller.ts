import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentActor,
  type AuthenticatedActor,
} from '../shared/decorators/current-actor.decorator.js';
import { Roles } from '../shared/decorators/roles.decorator.js';
import { AuthGuard } from '../shared/guards/auth.guard.js';
import { RolesGuard } from '../shared/guards/roles.guard.js';
import { AddCartItemDto, UpdateCartItemDto } from './cart.dto.js';
import { CartService } from './cart.service.js';

@Controller('cart')
@UseGuards(AuthGuard, RolesGuard)
@Roles('CUSTOMER')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@CurrentActor() actor: AuthenticatedActor) {
    return this.cart.get(actor.userId);
  }

  @Post('items')
  add(@CurrentActor() actor: AuthenticatedActor, @Body() body: AddCartItemDto) {
    return this.cart.add(actor.userId, body, body.quantity);
  }

  @Patch('items/:id')
  update(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id') id: string,
    @Body() body: UpdateCartItemDto,
  ) {
    return this.cart.setQuantity(actor.userId, id, body.quantity);
  }

  @Delete('items/:id')
  remove(@CurrentActor() actor: AuthenticatedActor, @Param('id') id: string) {
    return this.cart.remove(actor.userId, id);
  }
}
