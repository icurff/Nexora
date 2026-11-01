import { Module } from '@nestjs/common';
import { CodPaymentService } from './cod-payment.service.js';

@Module({
  providers: [CodPaymentService],
  exports: [CodPaymentService],
})
export class PaymentModule {}
