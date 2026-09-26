import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { refreshWallet } from '@/lib/wallet';

export default function useWallet() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['wallet', session?.phone],
    enabled: !!session?.phone,
    queryFn: async () => (await refreshWallet(session.phone)) ?? session,
    initialData: session ?? undefined,
    refetchInterval: 15000,
  });
}
