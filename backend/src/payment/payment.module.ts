import { Module } from '@nestjs/common';
import { CodPaymentService } from './cod-payment.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { PayosController } from './payos.controller.js';
import { PayosService } from './payos.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PayosController],
  providers: [CodPaymentService, PayosService],
  exports: [CodPaymentService],
})
export class PaymentModule {}
