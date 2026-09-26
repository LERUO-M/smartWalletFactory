import { useState } from 'react';
import Step from '../Step';
import TopBar from '../TopBar';
import Title from '../Title';
import Field from '../Field';
import Btn from '../Btn';
import { normalizePhone, findWalletByPhone } from '@/lib/wallet';

export default function SendRecipient({ wallet, onNext }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const next = async (e) => {
    e.preventDefault();
    const phone = normalizePhone(value);
    if (!phone) return setError('Enter a valid SA number, e.g. 082 123 4567');
    if (phone === wallet.phone) return setError("You can't send money to yourself");
    setBusy(true);
    const r = await findWalletByPhone(phone);
    setBusy(false);
    if (!r) return setError('Recipient has not registered yet — ask them to dial *384# first');
    onNext(r);
  };

  return (
    <Step>
      <TopBar label="Send · 1 of 3" />
      <form onSubmit={next} className="flex flex-1 flex-col">
        <Title title="Enter recipient phone number" />
        <Field
          type="tel" inputMode="tel" autoFocus placeholder="082 123 4567"
          value={value} onChange={(e) => { setValue(e.target.value); setError(''); }}
          error={error} helper="They must have a ZAR Wallet to receive funds"
        />
        <Btn type="submit" className="mt-auto" disabled={busy || !value}>{busy ? 'Checking…' : 'Next'}</Btn>
      </form>
    </Step>
  );
}
