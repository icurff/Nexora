import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../../services/api-client';
import { authQueryKeys } from './auth-query-keys';
import { useAuthStore } from '../../../context/auth-store';
import {
  changePassword,
  login,
  logout,
  refreshSession,
  register,
  storeAccessToken,
  storedAccessToken,
  updateProfile,
} from '../services/auth-api';

export function useLogin() {
  const queryClient = useQueryClient();
  const setAuthenticated = useAuthStore((state) => state.setAuthenticated);
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      login(email, password),
    onSuccess: (session) => {
      storeAccessToken(session.accessToken);
      queryClient.setQueryData(authQueryKeys.session, session);
      setAuthenticated(session.user);
    },
  });
}

export function useRegister() {
  return useMutation({ mutationFn: register });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const setAuthenticated = useAuthStore((state) => state.setAuthenticated);
  const setUnauthenticated = useAuthStore((state) => state.setUnauthenticated);
  return useMutation({
    mutationFn: async (input: { fullName?: string; phone?: string | null }) => {
      let token = storedAccessToken();
      if (!token) {
        const refreshed = await refreshSession();
        token = refreshed?.accessToken ?? null;
        storeAccessToken(token);
      }
      if (!token) throw new ApiError(401, { code: 'UNAUTHENTICATED' });
      try {
        return await updateProfile(input, token);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        const refreshed = await refreshSession();
        if (!refreshed) {
          storeAccessToken(null);
          queryClient.setQueryData(authQueryKeys.session, null);
          queryClient.removeQueries({ queryKey: ['cart'] });
          setUnauthenticated();
          throw error;
        }
        storeAccessToken(refreshed.accessToken);
        return updateProfile(input, refreshed.accessToken);
      }
    },
    onSuccess: (user) => {
      setAuthenticated(user);
      queryClient.setQueryData(authQueryKeys.session, {
        accessToken: storedAccessToken(),
        user,
      });
    },
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  const setAuthenticated = useAuthStore((state) => state.setAuthenticated);
  const setUnauthenticated = useAuthStore((state) => state.setUnauthenticated);
  return useMutation({
    mutationFn: async (input: {
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
    }) => {
      const token = storedAccessToken();
      if (!token) throw new ApiError(401, { code: 'UNAUTHENTICATED' });

      try {
        await changePassword(input, token);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;

        const refreshed = await refreshSession();
        storeAccessToken(refreshed?.accessToken ?? null);
        queryClient.setQueryData(authQueryKeys.session, refreshed);
        if (refreshed) setAuthenticated(refreshed.user);
        if (!refreshed) {
          setUnauthenticated();
          throw error;
        }

        await changePassword(input, refreshed.accessToken);
      }
    },
    onSuccess: () => {
      storeAccessToken(null);
      queryClient.setQueryData(authQueryKeys.session, null);
      queryClient.removeQueries({ queryKey: ['cart'] });
      setUnauthenticated();
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const setUnauthenticated = useAuthStore((state) => state.setUnauthenticated);
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      storeAccessToken(null);
      queryClient.setQueryData(authQueryKeys.session, null);
      queryClient.removeQueries({ queryKey: ['cart'] });
      setUnauthenticated();
    },
  });
}
