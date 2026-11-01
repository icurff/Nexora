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
import { CustomerManagementController } from './customer-management.controller.js';
import { CustomerManagementService } from './services/customer-management.service.js';
import { GoogleOAuthService } from './services/google-oauth.service.js';

@Module({
  imports: [NotificationModule],
  controllers: [
    AuthController,
    UserAddressController,
    CustomerManagementController,
  ],
  providers: [
    AuthService,
    GoogleOAuthService,
    PasswordResetService,
    PasswordResetTokenRepository,
    UserAddressService,
    UserAddressRepository,
    CustomerManagementService,
    UserRepository,
    SessionRepository,
    AuthGuard,
    RolesGuard,
  ],
  exports: [AuthService, AuthGuard, RolesGuard, UserAddressService],
})
export class AuthModule {}
