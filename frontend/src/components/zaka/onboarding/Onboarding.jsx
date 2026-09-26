import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import WelcomeStep from './WelcomeStep';
import PhoneStep from './PhoneStep';
import CreatedStep from './CreatedStep';
import PinStep from '../PinStep';
import { createWallet, sendWelcomeBonus } from '@/lib/wallet';

export default function Onboarding({ onCreated, onDone }) {
  const [step, setStep] = useState('welcome');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [wallet, setWallet] = useState(null);

  const confirm = async (p) => {
    if (p !== pin) return 'PINs do not match — try again';
    const w = await createWallet(phone, p);
    onCreated();
    setWallet(w);
    setStep('done');
    sendWelcomeBonus(w);
  };

  return (
    <div className="flex flex-1 flex-col">
      <AnimatePresence mode="wait">
        {step === 'welcome' && <WelcomeStep key="w" onNext={() => setStep('phone')} />}
        {step === 'phone' && (
          <PhoneStep key="p" onBack={() => setStep('welcome')} onNext={(ph) => { setPhone(ph); setStep('create'); }} />
        )}
        {step === 'create' && (
          <PinStep
            key="c" eyebrow="Step 2 of 3" cta="Continue"
            title="Create a 4-digit PIN to secure your wallet"
            sub="Use 4 to 6 digits. You'll need it to approve payments."
            onBack={() => setStep('phone')}
            onSubmit={(p) => { setPin(p); setStep('confirm'); }}
          />
        )}
        {step === 'confirm' && (
          <PinStep key="cf" eyebrow="Step 3 of 3" cta="Create Wallet" title="Confirm your PIN" onBack={() => setStep('create')} onSubmit={confirm} />
        )}
        {step === 'done' && <CreatedStep key="d" wallet={wallet} onDone={onDone} />}
      </AnimatePresence>
    </div>
  );
}
