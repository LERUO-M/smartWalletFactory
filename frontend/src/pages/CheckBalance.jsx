import { useNavigate } from 'react-router-dom';
import RequireWallet from '@/components/zaka/RequireWallet';
import Step from '@/components/zaka/Step';
import TopBar from '@/components/zaka/TopBar';
import Btn from '@/components/zaka/Btn';
import { zar } from '@/lib/wallet';

export default function CheckBalance() {
  const navigate = useNavigate();
  return (
    <RequireWallet>
      {(wallet) => (
        <Step>
          <TopBar label="Balance" />
          <div className="flex flex-1 flex-col justify-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-zaka-teal">Your balance</p>
            <p className="mt-4 flex items-baseline gap-3">
              <span className="font-mono text-sm text-zaka-mute">ZAR</span>
              <span className="font-display text-6xl font-semibold tracking-tight">{zar(wallet.balance)}</span>
            </p>
            <p className="mt-6 text-zaka-cream/90">Your wallet is ready to use.</p>
            <p className="mt-2 font-mono text-sm text-zaka-mute">{wallet.address.slice(0, 8)}...</p>
            {!wallet.balance && (
              <p className="mt-6 text-sm text-zaka-gold">Claim R100 demo funds or ask someone to send you ZAR.</p>
            )}
          </div>
          <Btn onClick={() => navigate('/app')}>Back to Menu</Btn>
        </Step>
      )}
    </RequireWallet>
  );
}
