import { apiClient } from './api-client';
import { storedAccessToken } from '../features/auth/services/access-token';

type TrackingEvent =
  | {
      eventType: 'view';
      productId: string;
    }
  | {
      eventType: 'search';
      queryLength: number;
      resultCount?: number;
    };

export async function trackEvent(event: TrackingEvent): Promise<void> {
  const token = storedAccessToken();

  try {
    const response = await apiClient.post(
      '/tracking/events',
      {
        eventId: crypto.randomUUID(),
        ...event,
      },
      {
        timeout: 3000,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    );

    if (import.meta.env.DEV) {
      console.debug('[Tracking] Recorded:', event, response.data);
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[Tracking] Failed:', event, error);
    }
  }
}
