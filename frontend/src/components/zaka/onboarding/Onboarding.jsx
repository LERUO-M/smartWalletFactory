import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import WelcomeStep from './WelcomeStep';
import PhoneStep from './PhoneStep';
import CreatedStep from './CreatedStep';
import PinStep from '../PinStep';
import { useAuth } from '@/lib/AuthContext';

export default function Onboarding({ onCreated, onDone }) {
  const { register } = useAuth();
  const [step, setStep] = useState('welcome');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [wallet, setWallet] = useState(null);

  const confirm = async (p) => {
    if (p !== pin) return 'PINs do not match — try again';
    try {
      const w = await register(phone, p);
      onCreated?.();
      setWallet(w);
      setStep('done');
    } catch (e) {
      return e.message || 'We could not create your wallet. Please try again.';
    }
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
            title="Create a PIN"
            sub="4 digits you'll use to approve every payment. Don't share it with anyone."
            onBack={() => setStep('phone')}
            onSubmit={(p) => { setPin(p); setStep('confirm'); }}
          />
        )}
        {step === 'confirm' && (
          <PinStep key="cf" eyebrow="Step 3 of 3" cta="Create wallet" title="Enter your PIN again" onBack={() => setStep('create')} onSubmit={confirm} />
        )}
        {step === 'done' && <CreatedStep key="d" wallet={wallet} onDone={onDone} />}
      </AnimatePresence>
    </div>
  );
}
