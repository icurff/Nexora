import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../../context/auth-store';
import { authQueryKeys } from './auth-query-keys';
import { storeAccessToken } from '../services/auth-api';
import {
  requestPasswordReset,
  resetPassword,
} from '../services/password-reset-api';

export function usePasswordResetRequest() {
  return useMutation({ mutationFn: requestPasswordReset });
}

export function usePasswordReset() {
  const queryClient = useQueryClient();
  const setUnauthenticated = useAuthStore((state) => state.setUnauthenticated);
  return useMutation({
    mutationFn: resetPassword,
    onSuccess: () => {
      storeAccessToken(null);
      queryClient.setQueryData(authQueryKeys.session, null);
      setUnauthenticated();
    },
  });
}
