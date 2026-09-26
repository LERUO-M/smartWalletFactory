import Step from '../Step';
import Btn from '../Btn';
import Logo from '../Logo';
import ThemeToggle from '../ThemeToggle';

const FACTS = [
  ['R0', 'Fees'],
  ['R100', 'Free bonus'],
  ['*384#', 'Any phone'],
];

export default function WelcomeStep({ onNext }) {
  return (
    <Step>
      <div className="-mr-2 flex justify-end">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 flex-col justify-center">
        <Logo size={52} />
        <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.25em] text-zaka-teal">Simple · Secure · ZAR</p>
        <h1 className="mt-4 font-display text-[46px] font-semibold leading-[1.02] tracking-tight">
          ZAR Smart
          <br />
          Wallet
        </h1>
        <p className="mt-5 max-w-[18rem] text-lg text-zaka-mute">No bank account needed. You only need this phone.</p>
        <div className="mt-12 grid grid-cols-3 gap-3 border-t border-zaka-line pt-6">
          {FACTS.map(([v, l]) => (
            <div key={l}>
              <p className="font-display text-xl text-zaka-gold">{v}</p>
              <p className="mt-1 text-xs text-zaka-mute">{l}</p>
            </div>
          ))}
        </div>
      </div>
      <Btn onClick={onNext}>Get Started</Btn>
    </Step>
  );
}
