import { motion } from 'framer-motion';
import { Smartphone, Gift, ArrowUpRight, Phone } from 'lucide-react';

const STEPS = [
  { icon: Smartphone, title: 'Create your wallet', body: 'Sign up with your phone number and a 4-digit PIN, then verify your ID with a quick selfie. No bank account needed.' },
  { icon: Gift, title: 'Add money', body: 'Claim your R100 welcome bonus, or ask someone to send you Rands by your phone number.' },
  { icon: ArrowUpRight, title: 'Send & receive', body: 'Move money instantly to anyone with a ZAKA wallet. Just enter their phone number.' },
  { icon: Phone, title: 'Works on any phone', body: 'Use it here on the web, or dial *384*123# on any phone — even without internet.' },
];

export default function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-zaka-teal">How it works</p>
      <h2 className="mt-4 max-w-xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        Four simple steps. That's the whole wallet.
      </h2>
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
            className="rounded-3xl border border-zaka-line bg-zaka-panel/50 p-6"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zaka-teal/15 text-zaka-teal">
              <s.icon className="h-5 w-5" />
            </span>
            <p className="mt-5 font-mono text-xs text-zaka-mute">Step {i + 1}</p>
            <h3 className="mt-1 text-lg font-medium">{s.title}</h3>
            <p className="mt-2 text-sm text-zaka-mute">{s.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
