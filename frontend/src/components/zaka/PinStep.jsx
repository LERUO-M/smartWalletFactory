import { useState } from 'react';
import Step from './Step';
import TopBar from './TopBar';
import Btn from './Btn';
import PinPad from './PinPad';

export default function PinStep({ eyebrow, title, sub, cta, onSubmit, onBack, children }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!/^\d{4,6}$/.test(pin)) return setError('PIN must be 4–6 digits only');
    setBusy(true);
    const err = await onSubmit(pin);
    setBusy(false);
    if (err) {
      setError(err);
      setPin('');
    }
  };

  return (
    <Step>
      <TopBar label={eyebrow} onBack={onBack} />
      <h1 className="font-display text-[28px] leading-[1.12] tracking-tight">{title}</h1>
      {sub && <p className="mt-2 text-zaka-mute">{sub}</p>}
      <div className="mt-6">{children}</div>
      <div className="mt-auto pt-4">
        <PinPad value={pin} onChange={(v) => { setPin(v); setError(''); }} error={error} />
        <Btn className="mt-4" onClick={submit} disabled={busy || pin.length < 4}>
          {busy ? 'Checking…' : cta}
        </Btn>
      </div>
    </Step>
  );
}
