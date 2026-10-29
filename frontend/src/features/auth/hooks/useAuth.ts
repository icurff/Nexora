import { useAuthStore } from '../../../context/auth-store';

export function useAuth() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  return { status, user };
}
