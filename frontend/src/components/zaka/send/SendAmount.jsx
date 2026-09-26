import { useState } from 'react';
import Step from '../Step';
import TopBar from '../TopBar';
import Title from '../Title';
import Field from '../Field';
import Btn from '../Btn';
import { zar, zarShort, formatPhone } from '@/lib/wallet';

export default function SendAmount({ wallet, recipient, onNext, onBack }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const next = (e) => {
    e.preventDefault();
    if (!/^\d+$/.test(value) || Number(value) <= 0) return setError('Enter an amount in whole Rands, e.g. 50');
    if (Number(value) > (wallet.balance || 0)) return setError(`Not enough money. Your balance is ${zar(wallet.balance)}.`);
    const left = wallet.kyc?.remaining?.todayCents;
    if (left !== undefined && Number(value) * 100 > left) return setError(`You can send up to ${zarShort(left)} more today.`);
    onNext(Number(value));
  };

  return (
    <Step>
      <TopBar label="Send · 2 of 3" onBack={onBack} />
      <form onSubmit={next} className="flex flex-1 flex-col">
        <Title title="How much?" sub={`Paying ${formatPhone(recipient.phone)}`} />
        <Field
          prefix="R" inputMode="numeric" autoFocus placeholder="25"
          value={value} onChange={(e) => { setValue(e.target.value.replace(/[^\d]/g, '')); setError(''); }}
          error={error} helper={`Balance: ${zar(wallet.balance)}${wallet.kyc?.remaining ? ` · You can send ${zarShort(wallet.kyc.remaining.todayCents)} more today` : ''}`}
        />
        <Btn type="submit" className="mt-auto" disabled={!value}>Next</Btn>
      </form>
    </Step>
  );
}
