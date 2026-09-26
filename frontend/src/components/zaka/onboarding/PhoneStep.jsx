import { useState } from 'react';
import Step from '../Step';
import TopBar from '../TopBar';
import Title from '../Title';
import Field from '../Field';
import Btn from '../Btn';
import { normalizePhone, findWalletByPhone } from '@/lib/wallet';

export default function PhoneStep({ onNext, onBack }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const next = async (e) => {
    e.preventDefault();
    const phone = normalizePhone(value);
    if (!phone) return setError('Enter a valid SA number, e.g. 082 123 4567');
    setBusy(true);
    const existing = await findWalletByPhone(phone);
    setBusy(false);
    if (existing) return setError('This number already has a wallet');
    onNext(phone);
  };

  return (
    <Step>
      <TopBar label="Step 1 of 3" onBack={onBack} />
      <form onSubmit={next} className="flex flex-1 flex-col">
        <Title title="What's your phone number?" sub="This is how people will pay you. We'll send payment alerts here by SMS." />
        <Field
          type="tel" inputMode="tel" autoFocus placeholder="082 123 4567"
          value={value} onChange={(e) => { setValue(e.target.value); setError(''); }}
          error={error} helper="South African numbers only"
        />
        <Btn type="submit" className="mt-auto" disabled={busy || !value}>
          {busy ? 'Checking…' : 'Continue'}
        </Btn>
      </form>
    </Step>
  );
}
