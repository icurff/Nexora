import {
  Body,
  Controller,
  Get,
  Param,
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
import {
  CancelOrderDto,
  OrderListQueryDto,
  PlaceOrderDto,
} from './order.dto.js';
import { OrderService } from './order.service.js';

@Controller('orders')
@UseGuards(AuthGuard, RolesGuard)
@Roles('CUSTOMER')
export class CustomerOrdersController {
  constructor(private readonly orders: OrderService) {}
  @Post() place(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() body: PlaceOrderDto,
  ) {
    return this.orders.place(actor, body);
  }
  @Get() list(
    @CurrentActor() actor: AuthenticatedActor,
    @Query() query: OrderListQueryDto,
  ) {
    return this.orders.listCustomer(actor, query);
  }
  @Get('by-checkout-key/:key') findByKey(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('key') key: string,
  ) {
    return this.orders.findByKey(actor, key);
  }
  @Get(':id') get(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id') id: string,
  ) {
    return this.orders.get(actor, id);
  }
  @Post(':id/cancel') cancel(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id') id: string,
    @Body() body: CancelOrderDto,
  ) {
    return this.orders.cancel(actor, id, body);
  }
}

@Controller('admin/orders')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminOrdersController {
  constructor(private readonly orders: OrderService) {}
  @Get() list(@Query() query: OrderListQueryDto) {
    return this.orders.listAdmin(query);
  }
  @Get(':id') get(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id') id: string,
  ) {
    return this.orders.get(actor, id, true);
  }
  @Post(':id/confirm') confirm(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id') id: string,
    @Body() body: import('./order.dto.js').ConfirmOrderDto,
  ) {
    return this.orders.confirm(actor, id, body);
  }
  @Post(':id/cancel') cancel(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id') id: string,
    @Body() body: CancelOrderDto,
  ) {
    return this.orders.cancel(actor, id, body, true);
  }
}
