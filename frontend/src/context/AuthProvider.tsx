import { useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authQueryKeys } from '../features/auth/hooks/auth-query-keys';
import { restoreSession } from '../features/auth/services/auth-api';
import { useAuthStore } from './auth-store';

export function AuthProvider({ children }: { children: ReactNode }) {
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
    if (sessionQuery.data) setAuthenticated(sessionQuery.data.user);
    else setUnauthenticated();
  }, [
    sessionQuery.data,
    sessionQuery.isPending,
    setAuthenticated,
    setUnauthenticated,
  ]);

  return children;
}
