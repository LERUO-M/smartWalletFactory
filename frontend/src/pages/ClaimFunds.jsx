import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import RequireWallet from '@/components/zaka/RequireWallet';
import PinStep from '@/components/zaka/PinStep';
import Processing from '@/components/zaka/Processing';
import Result from '@/components/zaka/Result';
import TxDetails from '@/components/zaka/TxDetails';
import SponsoredNote from '@/components/zaka/SponsoredNote';
import Btn from '@/components/zaka/Btn';
import { verifyPin, claimFaucet } from '@/lib/wallet';

function ClaimFlow({ wallet }) {
  const navigate = useNavigate();
  const [step, setStep] = useState('confirm');
  const [reference, setReference] = useState('');

  const claim = async (pin) => {
    if (!(await verifyPin(wallet, pin))) return 'Incorrect PIN — try again';
    setStep('processing');
    claimFaucet(wallet, pin)
      .then((ref) => { setReference(ref); setStep('success'); })
      .catch(() => setStep('failed'));
  };

  return (
    <div className="flex flex-1 flex-col">
      <AnimatePresence mode="wait">
        {step === 'confirm' && (
          <PinStep key="c" eyebrow="Demo money" title="Get R100 demo money" sub="Enter your PIN to add R100 to your balance" cta="Add R100" onBack={() => navigate('/app')} onSubmit={claim}>
            <SponsoredNote text="Demo money is free" />
          </PinStep>
        )}
        {step === 'processing' && <Processing key="p" label="Adding R100 to your balance" />}
        {step === 'success' && (
          <Result
            key="s" title="R100 added"
            actions={<><Btn onClick={() => navigate('/balance')}>See balance</Btn><Btn variant="ghost" onClick={() => navigate('/app')}>Back to menu</Btn></>}
          >
            <TxDetails reference={reference} />
          </Result>
        )}
        {step === 'failed' && (
          <Result key="f" ok={false} title="We couldn't add the demo money" actions={<Btn onClick={() => setStep('confirm')}>Try again</Btn>}>
            <p>Please try again.</p>
          </Result>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ClaimFunds() {
  return <RequireWallet>{(wallet) => <ClaimFlow wallet={wallet} />}</RequireWallet>;
}
