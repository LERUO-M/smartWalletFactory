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
import SmileIdCard from '@/components/zaka/kyc/SmileIdCard';
import Step from '@/components/zaka/Step';
import TopBar from '@/components/zaka/TopBar';
import Title from '@/components/zaka/Title';
import { verifyPin, sendMoney, zar, zarShort, formatPhone, isVerified } from '@/lib/wallet';

function SendFlow({ wallet }) {
  const navigate = useNavigate();
  const [step, setStep] = useState('recipient');
  const [to, setTo] = useState(null);
  const [amount, setAmount] = useState(0);
  const [reference, setReference] = useState('');
  const [err, setErr] = useState('');
  const menu = <Btn variant="ghost" onClick={() => navigate('/app')}>Back to menu</Btn>;

  const confirm = async (pin) => {
    if (!(await verifyPin(wallet, pin))) return 'Incorrect PIN — try again';
    if ((wallet.balance || 0) < amount) return `Not enough money. Your balance is ${zar(wallet.balance)}.`;
    setStep('processing');
    sendMoney(wallet, to, amount, pin)
      .then((ref) => { setReference(ref); setStep('success'); })
      .catch((e) => {
        const limits = wallet.kyc?.remaining;
        setErr(
          e.status === 403 && limits
            ? `That's more than you can send right now. You can still send ${zarShort(limits.todayCents)} today.`
            : 'Something went wrong. No money was sent.'
        );
        setStep('failed');
      });
  };

  return (
    <div className="flex flex-1 flex-col">
      <AnimatePresence mode="wait">
        {step === 'recipient' && <SendRecipient key="r" wallet={wallet} onNext={(r) => { setTo(r); setStep('amount'); }} />}
        {step === 'amount' && <SendAmount key="a" wallet={wallet} recipient={to} onBack={() => setStep('recipient')} onNext={(a) => { setAmount(a); setStep('confirm'); }} />}
        {step === 'confirm' && (
          <PinStep key="c" eyebrow="Send · 3 of 3" title="Confirm payment" sub="Enter your PIN to send" cta="Send now" onBack={() => setStep('amount')} onSubmit={confirm}>
            <SendSummary amount={amount} phone={to.phone} />
          </PinStep>
        )}
        {step === 'processing' && <Processing key="p" label="Sending your money" />}
        {step === 'success' && (
          <Result key="s" title="Money sent" actions={<Btn onClick={() => navigate('/app')}>Back to menu</Btn>}>
            <p className="text-lg text-zaka-cream">{zar(amount)} sent to {formatPhone(to.phone)}.</p>
            <p className="text-sm">They'll get an SMS to let them know.</p>
            <TxDetails reference={reference} />
          </Result>
        )}
        {step === 'failed' && (
          <Result key="f" ok={false} title="Payment didn't go through" actions={<><Btn onClick={() => setStep('confirm')}>Try again</Btn>{menu}</>}>
            <p>{err || 'Something went wrong. No money was sent.'}</p>
          </Result>
        )}
      </AnimatePresence>
    </div>
  );
}

// Sending from the web app requires full identity verification (Level 1).
function VerifyFirst() {
  return (
    <Step>
      <TopBar label="Send" />
      <Title title="Verify your identity first" sub="To keep everyone's money safe, you need to verify who you are before you can send money. You can still receive money while you wait." />
      <SmileIdCard />
    </Step>
  );
}

export default function SendMoney() {
  return (
    <RequireWallet>
      {(wallet) => (isVerified(wallet) ? <SendFlow wallet={wallet} /> : <VerifyFirst />)}
    </RequireWallet>
  );
}
