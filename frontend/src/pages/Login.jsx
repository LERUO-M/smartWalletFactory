import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Step from '@/components/zaka/Step';
import TopBar from '@/components/zaka/TopBar';
import Title from '@/components/zaka/Title';
import Field from '@/components/zaka/Field';
import Btn from '@/components/zaka/Btn';
import PinStep from '@/components/zaka/PinStep';
import { useAuth } from '@/lib/AuthContext';
import { normalizePhone, findWalletByPhone } from '@/lib/wallet';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [step, setStep] = useState('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submitPhone = async (e) => {
    e.preventDefault();
    const p = normalizePhone(phoneInput);
    if (!p) return setError('Enter a valid SA number, e.g. 082 123 4567');
    setBusy(true);
    const existing = await findWalletByPhone(p);
    setBusy(false);
    if (!existing) return setError('No wallet for this number — create one first');
    setPhone(p);
    setStep('pin');
  };

  const submitPin = async (pin) => {
    try {
      await login(phone, pin);
      navigate('/app');
    } catch (e) {
      return e.message || 'Login failed';
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <AnimatePresence mode="wait">
        {step === 'phone' && (
          <Step key="phone">
            <TopBar label="Sign in" onBack={() => navigate('/')} />
            <form onSubmit={submitPhone} className="flex flex-1 flex-col">
              <Title title="Welcome back" sub="Enter the phone number tied to your wallet." />
              <Field
                type="tel" inputMode="tel" autoFocus placeholder="082 123 4567"
                value={phoneInput}
                onChange={(e) => { setPhoneInput(e.target.value); setError(''); }}
                error={error}
              />
              <Btn type="submit" className="mt-auto" disabled={busy || !phoneInput}>
                {busy ? 'Checking…' : 'Continue'}
              </Btn>
              <p className="mt-4 text-center text-sm text-zaka-mute">
                No wallet yet?{' '}
                <Link to="/onboarding" className="text-zaka-cream underline">Create one</Link>
              </p>
            </form>
          </Step>
        )}
        {step === 'pin' && (
          <PinStep
            key="pin"
            eyebrow="Sign in"
            title="Enter your PIN"
            sub={`Signing in as ${phone}`}
            cta="Sign in"
            onBack={() => setStep('phone')}
            onSubmit={submitPin}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
