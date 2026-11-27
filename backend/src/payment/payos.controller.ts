import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { Webhook } from '@payos/node';
import {
  CurrentActor,
  type AuthenticatedActor,
} from '../shared/decorators/current-actor.decorator.js';
import { Roles } from '../shared/decorators/roles.decorator.js';
import { AuthGuard } from '../shared/guards/auth.guard.js';
import { RolesGuard } from '../shared/guards/roles.guard.js';
import { PayosService } from './payos.service.js';

@Controller()
export class PayosController {
  constructor(private readonly payos: PayosService) {}

  @Post('orders/:id/payments/payos')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CUSTOMER', 'ADMIN')
  link(@CurrentActor() actor: AuthenticatedActor, @Param('id') id: string) {
    return this.payos.link(actor, id);
  }

  @Post('orders/:id/payments/payos/reconcile')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CUSTOMER', 'ADMIN')
  reconcile(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id') id: string,
  ) {
    return this.payos.reconcile(actor, id);
  }

  @Post('payments/payos/webhook')
  webhook(@Body() body: Webhook) {
    return this.payos.webhook(body);
  }

  @Get('admin/orders/:id/payments/payos')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN')
  transactions(@Param('id') id: string) {
    return this.payos.transactions(id);
  }

  @Get('admin/payments/payos/exceptions')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN')
  exceptions() {
    return this.payos.exceptions();
  }
}
