import { useState } from 'react';
import Step from '../Step';
import TopBar from '../TopBar';
import Title from '../Title';
import Field from '../Field';
import Btn from '../Btn';
import { zar, formatPhone } from '@/lib/wallet';

export default function SendAmount({ wallet, recipient, onNext, onBack }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const next = (e) => {
    e.preventDefault();
    if (!/^\d+$/.test(value) || Number(value) <= 0) return setError('Enter a positive whole number');
    onNext(Number(value));
  };

  return (
    <Step>
      <TopBar label="Send · 2 of 3" onBack={onBack} />
      <form onSubmit={next} className="flex flex-1 flex-col">
        <Title title="Enter amount in ZAR (whole number)" sub={`To ${formatPhone(recipient.phone)}`} />
        <Field
          prefix="R" inputMode="numeric" autoFocus placeholder="25"
          value={value} onChange={(e) => { setValue(e.target.value.replace(/[^\d]/g, '')); setError(''); }}
          error={error} helper={`Available: ${zar(wallet.balance)}`}
        />
        <Btn type="submit" className="mt-auto" disabled={!value}>Next</Btn>
      </form>
    </Step>
  );
}
