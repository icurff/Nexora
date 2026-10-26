import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import {
  AuthController,
  InternalAuthController,
} from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AppController, AuthController, InternalAuthController],
  providers: [AppService, AuthService],
})
export class AppModule {}
