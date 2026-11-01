import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAddress,
  deleteAddress,
  getAddresses,
  setDefaultAddress,
  updateAddress,
  type AddressInput,
} from '../services/address-api';

const addressQueryKey = ['account', 'addresses'] as const;

export function useAddresses(enabled = true) {
  return useQuery({
    queryKey: addressQueryKey,
    queryFn: getAddresses,
    enabled,
  });
}

export function useAddressMutations() {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: addressQueryKey });

  return {
    create: useMutation({ mutationFn: createAddress, onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: AddressInput }) =>
        updateAddress(id, input),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: deleteAddress, onSuccess: refresh }),
    setDefault: useMutation({
      mutationFn: setDefaultAddress,
      onSuccess: refresh,
    }),
  };
}
