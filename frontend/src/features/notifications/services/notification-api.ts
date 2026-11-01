import { createParser } from 'eventsource-parser';
import { API_BASE_URL } from '../../../config/api';
import { ApiClient } from '../../../services/api-client';
import {
  refreshSession,
  storeAccessToken,
  storedAccessToken,
} from '../../auth/services/auth-api';

export type UserNotification = {
  id: string;
  type: string;
  orderId: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};
export type NotificationPage = {
  items: UserNotification[];
  total: number;
  unreadCount: number;
};

export async function getNotifications(
  input: { page?: number; pageSize?: number; unreadOnly?: boolean } = {},
) {
  const response = await ApiClient.get<NotificationPage>('/notifications', {
    params: input,
  });
  return response.data;
}

export async function markNotificationRead(id: string) {
  await ApiClient.patch(`/notifications/${encodeURIComponent(id)}/read`);
}

export async function markAllNotificationsRead() {
  await ApiClient.patch('/notifications/read-all');
}

export async function runNotificationStream(
  signal: AbortSignal,
  onChange: () => void,
  onConnection: (connected: boolean) => void,
  onAuthExpired: () => void,
) {
  let delay = 1000;
  while (!signal.aborted) {
    let token = storedAccessToken();
    if (!token) {
      const refreshed = await refreshSession();
      token = refreshed?.accessToken ?? null;
      storeAccessToken(token);
      if (!token) onAuthExpired();
    }
    if (!token) {
      onConnection(false);
      await wait(delay, signal);
      delay = Math.min(delay * 2, 30_000);
      continue;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/notifications/stream`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
        credentials: 'include',
        signal,
      });
      if (!response.ok || !response.body) {
        if (response.status === 401) {
          const refreshed = await refreshSession();
          if (refreshed) storeAccessToken(refreshed.accessToken);
          else {
            storeAccessToken(null);
            onAuthExpired();
          }
        }
        throw new Error(`SSE ${response.status}`);
      }
      onConnection(true);
      delay = 1000;
      const parser = createParser({
        onEvent: (event) => {
          if (
            event.event === 'notifications.sync' ||
            event.event === 'notifications.changed'
          )
            onChange();
        },
      });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (!signal.aborted) {
        const chunk = await reader.read();
        if (chunk.done) break;
        parser.feed(decoder.decode(chunk.value, { stream: true }));
      }
    } catch {
      if (!signal.aborted) {
        onConnection(false);
        await wait(delay, signal);
        delay = Math.min(delay * 2, 30_000);
      }
    }
  }
}

function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
