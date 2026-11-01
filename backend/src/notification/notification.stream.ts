import { Injectable } from '@nestjs/common';
import { Subject, type Observable } from 'rxjs';

export type NotificationSignal = {
  type: 'notifications.changed' | 'notifications.sync';
};

@Injectable()
export class NotificationStream {
  private readonly streams = new Map<bigint, Subject<NotificationSignal>>();

  connect(userId: bigint): Observable<NotificationSignal> {
    let stream = this.streams.get(userId);
    if (!stream) {
      stream = new Subject<NotificationSignal>();
      this.streams.set(userId, stream);
    }
    return stream.asObservable();
  }

  disconnect(userId: bigint) {
    const stream = this.streams.get(userId);
    if (stream && stream.observed === false) this.streams.delete(userId);
  }

  publish(
    userId: bigint,
    type: NotificationSignal['type'] = 'notifications.changed',
  ) {
    try {
      this.streams.get(userId)?.next({ type });
    } catch {
      // A disconnected client must never affect the committed business operation.
    }
  }
}
