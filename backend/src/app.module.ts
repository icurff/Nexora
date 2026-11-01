import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { OrderModule } from './order/order.module.js';

@Module({
  imports: [DatabaseModule, AuthModule, CatalogModule, OrderModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
