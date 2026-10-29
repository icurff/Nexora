import { Module } from '@nestjs/common';
import { GmailEmailProvider } from './providers/gmail-email.provider.js';

@Module({
  providers: [GmailEmailProvider],
  exports: [GmailEmailProvider],
})
export class NotificationModule {}
