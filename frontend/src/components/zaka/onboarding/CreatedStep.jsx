import { Gift } from 'lucide-react';
import Result from '../Result';
import Btn from '../Btn';
import SmileIdCard from '../kyc/SmileIdCard';
import { formatPhone } from '@/lib/wallet';

export default function CreatedStep({ wallet, onDone }) {
  return (
    <Result title={`Wallet created for ${formatPhone(wallet.phone)}`} actions={<Btn variant="ghost" onClick={onDone}>I'll do this later</Btn>}>
      <div className="flex gap-3 rounded-2xl border border-zaka-gold/25 bg-zaka-gold/5 p-4">
        <Gift className="mt-0.5 h-5 w-5 shrink-0 text-zaka-gold" />
        <p className="text-zaka-cream">We have sent you some ZAKA as a welcome bonus! Check your balance!</p>
      </div>
      <SmileIdCard />
    </Result>
  );
}
