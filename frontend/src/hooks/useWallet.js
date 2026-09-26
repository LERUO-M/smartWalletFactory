import { useQuery } from '@tanstack/react-query';
import { MOCK_WALLET } from '@/lib/wallet';

export default function useWallet() {
  return useQuery({ queryKey: ['wallet'], queryFn: async () => MOCK_WALLET });
}
