import useWallet from '@/hooks/useWallet';
import Loader from '@/components/zaka/Loader';
import Onboarding from '@/components/zaka/onboarding/Onboarding';
import Dashboard from '@/components/zaka/dashboard/Dashboard';
import { useAuth } from '@/lib/AuthContext';

export default function WalletHome() {
  const { isAuthenticated } = useAuth();
  const { data: wallet, isLoading } = useWallet();

  if (!isAuthenticated) return <Onboarding onDone={() => {}} />;
  if (isLoading && !wallet) return <Loader />;
  if (!wallet) return <Loader />;
  return <Dashboard wallet={wallet} />;
}
