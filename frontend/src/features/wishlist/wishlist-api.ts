import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClient } from '../../services/api-client';
import { useAuth } from '../auth/hooks/useAuth';

export function useWishlist() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['wishlist', user?.id],
    queryFn: async () =>
      (await ApiClient.get<{ items: string[] }>('/wishlist')).data.items,
    enabled: Boolean(user),
    retry: false,
  });
}
export function useToggleWishlist() {
  const { user } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, liked }: { id: string; liked: boolean }) => {
      if (liked) await ApiClient.delete(`/wishlist/${id}`);
      else await ApiClient.put(`/wishlist/${id}`);
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['wishlist', user?.id] }),
  });
}
