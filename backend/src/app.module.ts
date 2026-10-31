import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';

@Module({
  imports: [DatabaseModule, AuthModule, CatalogModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
