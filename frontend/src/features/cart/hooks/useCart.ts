import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  addCartItem,
  getCart,
  removeCartItem,
  updateCartItem,
} from '../services/cart-api';

export const cartKey = (userId: string | undefined) =>
  ['cart', userId] as const;

export function useCart() {
  const { user } = useAuth();
  return useQuery({
    queryKey: cartKey(user?.id),
    queryFn: getCart,
    enabled: Boolean(user && user.role === 'CUSTOMER'),
    retry: false,
    refetchOnWindowFocus: true,
  });
}

function useCartMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<unknown>,
) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    retry: false,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: cartKey(user?.id) });
    },
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: cartKey(user?.id) });
    },
  });
}

export function useAddCartItem() {
  return useCartMutation(
    ({ variantId, productId, quantity }: { variantId?: string; productId?: string; quantity: number }) =>
      addCartItem({ variantId, productId }, quantity),
  );
}

export function useUpdateCartItem() {
  return useCartMutation(({ id, quantity }: { id: string; quantity: number }) =>
    updateCartItem(id, quantity),
  );
}

export function useRemoveCartItem() {
  return useCartMutation(({ id }: { id: string }) => removeCartItem(id));
}
