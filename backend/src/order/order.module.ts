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
import { NotificationModule } from '../notification/notification.module.js';
import { PaymentModule } from '../payment/payment.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { DashboardRepository } from './dashboard.repository.js';

@Module({
  imports: [AuthModule, CatalogModule, NotificationModule, PaymentModule],
  controllers: [
    CartController,
    CustomerOrdersController,
    AdminOrdersController,
    DashboardController,
  ],
  providers: [
    CartService,
    OrderRepository,
    OrderService,
    DashboardRepository,
    DashboardService,
  ],
})
export class OrderModule {}
