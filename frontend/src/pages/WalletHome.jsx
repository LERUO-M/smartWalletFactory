import { useState } from 'react';
import useWallet from '@/hooks/useWallet';
import Loader from '@/components/zaka/Loader';
import Onboarding from '@/components/zaka/onboarding/Onboarding';
import Dashboard from '@/components/zaka/dashboard/Dashboard';
import { refreshWallet } from '@/lib/wallet';

export default function WalletHome() {
  const { data: wallet, isLoading } = useWallet();
  const [justCreated, setJustCreated] = useState(false);

  if (isLoading) return <Loader />;
  if (!wallet || justCreated) {
    return (
      <Onboarding
        onCreated={() => setJustCreated(true)}
        onDone={async () => { await refreshWallet(); setJustCreated(false); }}
      />
    );
  }
  return <Dashboard wallet={wallet} />;
}
