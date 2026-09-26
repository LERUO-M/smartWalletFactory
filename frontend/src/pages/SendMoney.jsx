import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import RequireWallet from '@/components/zaka/RequireWallet';
import SendRecipient from '@/components/zaka/send/SendRecipient';
import SendAmount from '@/components/zaka/send/SendAmount';
import SendSummary from '@/components/zaka/send/SendSummary';
import PinStep from '@/components/zaka/PinStep';
import Processing from '@/components/zaka/Processing';
import Result from '@/components/zaka/Result';
import TxDetails from '@/components/zaka/TxDetails';
import Btn from '@/components/zaka/Btn';
import { verifyPin, sendMoney, zar, formatPhone } from '@/lib/wallet';

function SendFlow({ wallet }) {
  const navigate = useNavigate();
  const [step, setStep] = useState('recipient');
  const [to, setTo] = useState(null);
  const [amount, setAmount] = useState(0);
  const [hash, setHash] = useState('');
  const [err, setErr] = useState('');
  const menu = <Btn variant="ghost" onClick={() => navigate('/app')}>Back to Menu</Btn>;

  const confirm = async (pin) => {
    if (!(await verifyPin(wallet, pin))) return 'Incorrect PIN — try again';
    if ((wallet.balance || 0) < amount) return `Insufficient balance — your balance is ${zar(wallet.balance)}, tried to send ${zar(amount)}`;
    setStep('processing');
    sendMoney(wallet, to, amount, pin)
      .then((h) => { setHash(h); setStep('success'); })
      .catch((e) => { setErr(e.message); setStep('failed'); });
  };

  return (
    <div className="flex flex-1 flex-col">
      <AnimatePresence mode="wait">
        {step === 'recipient' && <SendRecipient key="r" wallet={wallet} onNext={(r) => { setTo(r); setStep('amount'); }} />}
        {step === 'amount' && <SendAmount key="a" wallet={wallet} recipient={to} onBack={() => setStep('recipient')} onNext={(a) => { setAmount(a); setStep('confirm'); }} />}
        {step === 'confirm' && (
          <PinStep key="c" eyebrow="Send · 3 of 3" title="Confirm payment" sub="Enter your 4-digit PIN to confirm" cta="Confirm & Send" onBack={() => setStep('amount')} onSubmit={confirm}>
            <SendSummary amount={amount} phone={to.phone} />
          </PinStep>
        )}
        {step === 'processing' && <Processing key="p" label="Sending your money" />}
        {step === 'success' && (
          <Result key="s" title="Sent!" actions={<Btn onClick={() => navigate('/app')}>Back to Menu</Btn>}>
            <p className="text-lg text-zaka-cream">{zar(amount)} sent to {formatPhone(to.phone)}</p>
            <TxDetails hash={hash} />
          </Result>
        )}
        {step === 'failed' && (
          <Result key="f" ok={false} title="Transaction Failed" actions={<><Btn onClick={() => setStep('confirm')}>Try Again</Btn>{menu}</>}>
            <p>{err || 'Something went wrong. No money was sent.'}</p>
          </Result>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function SendMoney() {
  return <RequireWallet>{(wallet) => <SendFlow wallet={wallet} />}</RequireWallet>;
}
