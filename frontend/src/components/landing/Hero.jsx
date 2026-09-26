import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/AuthContext';
import Logo from '@/components/zaka/Logo';

const STATS = [
  ['R0', 'Fees'],
  ['R100', 'Welcome bonus'],
  ['*384#', 'Any phone'],
];

export default function Hero() {
  const { isAuthenticated } = useAuth();
  const primary = isAuthenticated
    ? { label: 'Open my wallet', to: '/app' }
    : { label: "Get started — it's free", to: '/onboarding' };
  const secondary = isAuthenticated ? null : { label: 'I already have a wallet', to: '/login' };

  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-zaka-teal/10 blur-3xl" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:grid-cols-2 md:py-24">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-zaka-teal">Simple · Secure · ZAR</p>
          <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
            Money on your phone. <br className="hidden sm:block" /> No bank account needed.
          </h1>
          <p className="mt-6 max-w-md text-lg text-zaka-mute">
            ZAKA is a Rand wallet that works on any phone. Send and receive money instantly — no fees, no apps to install, no bank account required.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to={primary.to} className="inline-flex h-14 items-center justify-center rounded-2xl bg-zaka-cream px-8 font-medium text-zaka-ink transition hover:opacity-90">
              {primary.label}
            </Link>
            {secondary && (
              <Link to={secondary.to} className="inline-flex h-14 items-center justify-center rounded-2xl border border-zaka-line px-8 font-medium text-zaka-cream transition hover:bg-zaka-cream/5">
                {secondary.label}
              </Link>
            )}
          </div>
          <div className="mt-12 grid max-w-md grid-cols-3 gap-4 border-t border-zaka-line pt-6">
            {STATS.map(([v, l]) => (
              <div key={l}>
                <p className="font-display text-xl text-zaka-gold">{v}</p>
                <p className="mt-1 text-xs text-zaka-mute">{l}</p>
              </div>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto w-full max-w-[300px]"
        >
          <PhoneMock />
        </motion.div>
      </div>
    </section>
  );
}

function PhoneMock() {
  return (
    <div className="relative rounded-[2.2rem] border border-zaka-line bg-gradient-to-b from-zaka-panel to-zaka-ink p-5 shadow-2xl">
      <div className="flex items-center gap-2">
        <Logo size={22} />
        <span className="text-xs text-zaka-mute">072 123 4567</span>
      </div>
      <div className="mt-5 rounded-2xl bg-zaka-cream/5 p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zaka-mute">Available balance</p>
        <p className="mt-2 font-display text-3xl font-semibold">R100.00</p>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-zaka-teal/15 px-2.5 py-1 text-[11px] text-zaka-teal">
          <span className="h-1.5 w-1.5 rounded-full bg-zaka-teal" /> Active
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {['Check balance', 'Send money', 'Claim funds', 'My address'].map((t) => (
          <div key={t} className="rounded-xl border border-zaka-line bg-zaka-panel/60 p-3 text-xs">{t}</div>
        ))}
      </div>
      <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-zaka-mute">No fees · *384#</p>
    </div>
  );
}
