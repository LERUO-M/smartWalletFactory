import { Gift } from 'lucide-react';
import Result from '../Result';
import Btn from '../Btn';
import { shortAddr } from '@/lib/wallet';

export default function CreatedStep({ wallet, onDone }) {
  return (
    <Result title="Wallet Created!" actions={<Btn onClick={onDone}>Go to Dashboard</Btn>}>
      <div className="rounded-2xl border border-zaka-line bg-zaka-panel p-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-zaka-mute">Your wallet</p>
        <p className="mt-1 font-mono text-base text-zaka-cream">{shortAddr(wallet.address)}</p>
      </div>
      <div className="flex gap-3 rounded-2xl border border-zaka-gold/25 bg-zaka-gold/5 p-4">
        <Gift className="mt-0.5 h-5 w-5 shrink-0 text-zaka-gold" />
        <div>
          <p className="text-zaka-cream">We are sending you a R100 welcome bonus.</p>
          <p className="mt-1 text-sm">Check your balance after a few seconds.</p>
        </div>
      </div>
    </Result>
  );
}
