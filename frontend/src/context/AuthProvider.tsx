import { useEffect, useRef, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { authQueryKeys } from '../features/auth/hooks/auth-query-keys';
import { restoreSession } from '../features/auth/services/auth-api';
import { useAuthStore } from './auth-store';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const lastUserId = useRef<string | null>(null);
  const sessionQuery = useQuery({
    queryKey: authQueryKeys.session,
    queryFn: restoreSession,
    retry: false,
    staleTime: Infinity,
  });

  const setAuthenticated = useAuthStore((state) => state.setAuthenticated);
  const setUnauthenticated = useAuthStore((state) => state.setUnauthenticated);

  useEffect(() => {
    if (sessionQuery.isPending) return;
    const userId = sessionQuery.data?.user.id ?? null;
    if (lastUserId.current !== userId)
      queryClient.removeQueries({ queryKey: ['notifications'] });
    lastUserId.current = userId;
    if (sessionQuery.data) setAuthenticated(sessionQuery.data.user);
    else setUnauthenticated();
  }, [
    queryClient,
    sessionQuery.data,
    sessionQuery.isPending,
    setAuthenticated,
    setUnauthenticated,
  ]);

  return children;
}
