import { Module } from '@nestjs/common';
import { GmailEmailProvider } from './providers/gmail-email.provider.js';
import { NotificationRepository } from './notification.repository.js';
import { NotificationService } from './notification.service.js';
import { EmailOutboxWorker } from './email-outbox.worker.js';

@Module({
  providers: [
    GmailEmailProvider,
    NotificationRepository,
    NotificationService,
    EmailOutboxWorker,
  ],
  exports: [GmailEmailProvider, NotificationService],
})
export class NotificationModule {}
