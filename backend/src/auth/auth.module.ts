import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthGuard } from '../shared/guards/auth.guard.js';
import { RolesGuard } from '../shared/guards/roles.guard.js';
import { UserRepository } from './repositories/user.repository.js';
import { SessionRepository } from './repositories/session.repository.js';
import { PasswordResetService } from './services/password-reset.service.js';
import { PasswordResetTokenRepository } from './repositories/password-reset-token.repository.js';
import { NotificationModule } from '../notification/notification.module.js';
import { UserAddressService } from './services/user-address.service.js';
import { UserAddressRepository } from './repositories/user-address.repository.js';
import { UserAddressController } from './user-address.controller.js';

@Module({
  imports: [NotificationModule],
  controllers: [AuthController, UserAddressController],
  providers: [
    AuthService,
    PasswordResetService,
    PasswordResetTokenRepository,
    UserAddressService,
    UserAddressRepository,
    UserRepository,
    SessionRepository,
    AuthGuard,
    RolesGuard,
  ],
  exports: [AuthService, AuthGuard, RolesGuard],
})
export class AuthModule {}
