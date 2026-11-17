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
    await apiClient.post(
      '/tracking/events',
      {
        eventId: crypto.randomUUID(),
        ...event,
      },
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    );
  } catch {
    // Tracking lỗi không được chặn thao tác mua sắm.
  }
}
