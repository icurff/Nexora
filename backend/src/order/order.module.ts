import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { CartController } from './cart.controller.js';
import { CartService } from './cart.service.js';
import {
  CustomerOrdersController,
  AdminOrdersController,
} from './order.controller.js';
import { OrderRepository } from './order.repository.js';
import { OrderService } from './order.service.js';

@Module({
  imports: [AuthModule, CatalogModule],
  controllers: [
    CartController,
    CustomerOrdersController,
    AdminOrdersController,
  ],
  providers: [CartService, OrderRepository, OrderService],
})
export class OrderModule {}
