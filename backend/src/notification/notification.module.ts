import { Module } from '@nestjs/common';
import { GmailEmailProvider } from './providers/gmail-email.provider.js';
import { NotificationRepository } from './notification.repository.js';
import { NotificationService } from './notification.service.js';
import { EmailOutboxWorker } from './email-outbox.worker.js';
import { NotificationStream } from './notification.stream.js';

@Module({
  providers: [
    GmailEmailProvider,
    NotificationRepository,
    NotificationService,
    EmailOutboxWorker,
    NotificationStream,
  ],
  exports: [GmailEmailProvider, NotificationService, NotificationStream],
})
export class NotificationModule {}
