import { motion } from 'framer-motion';
import { Wallet, Zap, ShieldCheck, Gift, Phone, ArrowUpRight } from 'lucide-react';

const ITEMS = [
  { icon: Wallet, title: 'No bank account', body: 'All you need is a phone number to open a wallet.' },
  { icon: Zap, title: 'Zero fees', body: 'Every payment is free — fees are covered for you.' },
  { icon: ShieldCheck, title: 'PIN-secured', body: 'Approve each payment with your own 4-digit PIN.' },
  { icon: ArrowUpRight, title: 'Instant transfers', body: 'Money arrives in seconds, any time of day.' },
  { icon: Gift, title: 'R100 welcome bonus', body: 'Start with R100 in your wallet to try it out.' },
  { icon: Phone, title: 'Works on any phone', body: 'Use the web or dial *384# — no smartphone needed.' },
];

export default function Features() {
  return (
    <section className="border-y border-zaka-line bg-zaka-panel/30">
      <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-zaka-teal">Why ZAKA</p>
        <h2 className="mt-4 max-w-xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Built for everyone, not just the banked.
        </h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.4, delay: (i % 3) * 0.05 }}
              className="rounded-3xl border border-zaka-line bg-zaka-ink p-6"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zaka-teal/15 text-zaka-teal">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-lg font-medium">{f.title}</h3>
              <p className="mt-2 text-sm text-zaka-mute">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
