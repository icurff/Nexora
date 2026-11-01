import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  runNotificationStream,
} from '../services/notification-api';
import { create } from 'zustand';
import { useAuthStore } from '../../../context/auth-store';
import { authQueryKeys } from '../../auth/hooks/auth-query-keys';

const useNotificationConnectionStore = create<{
  connected: boolean;
  setConnected: (connected: boolean) => void;
}>((set) => ({
  connected: false,
  setConnected: (connected) => set({ connected }),
}));

export function useNotificationConnection() {
  return useNotificationConnectionStore((state) => state.connected);
}

export const notificationKeys = {
  all: (userId: string | undefined) => ['notifications', userId] as const,
  list: (
    userId: string | undefined,
    page: number,
    unreadOnly: boolean,
    pageSize = 20,
  ) => ['notifications', userId, 'list', page, pageSize, unreadOnly] as const,
};

export function useNotificationSummary(pageSize = 10) {
  const { user } = useAuth();
  return useQuery({
    queryKey: notificationKeys.list(user?.id, 1, false, pageSize),
    queryFn: () => getNotifications({ page: 1, pageSize }),
    enabled: user?.role === 'CUSTOMER',
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function useNotificationStream() {
  const { user } = useAuth();
  const client = useQueryClient();
  const setConnected = useNotificationConnectionStore(
    (state) => state.setConnected,
  );
  const setUnauthenticated = useAuthStore((state) => state.setUnauthenticated);
  useEffect(() => {
    if (user?.role !== 'CUSTOMER') return;
    const controller = new AbortController();
    void runNotificationStream(
      controller.signal,
      () => {
        void client.invalidateQueries({
          queryKey: notificationKeys.all(user.id),
        });
      },
      setConnected,
      () => {
        controller.abort();
        client.setQueryData(authQueryKeys.session, null);
        client.removeQueries({ queryKey: notificationKeys.all(user.id) });
        setUnauthenticated();
      },
    );
    const refresh = () => {
      if (document.visibilityState === 'visible')
        void client.invalidateQueries({
          queryKey: notificationKeys.all(user.id),
        });
    };
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      controller.abort();
      setConnected(false);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [client, setConnected, setUnauthenticated, user?.id, user?.role]);
}

export function useMarkNotificationRead() {
  const client = useQueryClient();
  const { user } = useAuth();
  return async (id: string) => {
    await markNotificationRead(id);
    await client.invalidateQueries({
      queryKey: notificationKeys.all(user?.id),
    });
  };
}

export function useMarkAllNotificationsRead() {
  const client = useQueryClient();
  const { user } = useAuth();
  return async () => {
    await markAllNotificationsRead();
    await client.invalidateQueries({
      queryKey: notificationKeys.all(user?.id),
    });
  };
}
