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
  const [hash, setHash] = useState('');

  const claim = async (pin) => {
    if (!(await verifyPin(wallet, pin))) return 'Incorrect PIN — try again';
    setStep('processing');
    claimFaucet(wallet)
      .then((h) => { setHash(h); setStep('success'); })
      .catch(() => setStep('failed'));
  };

  return (
    <div className="flex flex-1 flex-col">
      <AnimatePresence mode="wait">
        {step === 'confirm' && (
          <PinStep key="c" eyebrow="Demo funds" title="Claim your R100 demo funds" sub="Enter your 4-digit PIN to confirm" cta="Claim" onBack={() => navigate('/app')} onSubmit={claim}>
            <SponsoredNote text="Free — no fees" />
          </PinStep>
        )}
        {step === 'processing' && <Processing key="p" label="Claiming your R100" />}
        {step === 'success' && (
          <Result
            key="s" title="R100 ZAR Claimed!"
            actions={<><Btn onClick={() => navigate('/balance')}>Check Balance</Btn><Btn variant="ghost" onClick={() => navigate('/app')}>Back to Menu</Btn></>}
          >
            <TxDetails hash={hash} />
          </Result>
        )}
        {step === 'failed' && (
          <Result key="f" ok={false} title="Faucet claim failed" actions={<Btn onClick={() => setStep('confirm')}>Try Again</Btn>}>
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
